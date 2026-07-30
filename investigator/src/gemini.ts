import { RESPONSE_SCHEMA, montarPromptTexto } from "./prompt.js";
import type { DetalheExtraido, EvidenciaExterna, GeminiCallResult, InvestigacaoResultado, ListingParaInvestigar } from "./types.js";

// Regra 9 do ajuste pedido: confianca alta so e aceita com pelo menos 2
// evidencias independentes fortes. Isso e reforcado aqui em codigo (nao so
// no prompt) porque um LLM pode nao seguir a instrucao a risca - e uma rede
// de seguranca deterministica, nao uma substituicao da instrucao no prompt.
const MINIMO_EVIDENCIAS_PARA_ALTA_CONFIANCA = 2;
const TETO_CONFIANCA_SEM_EVIDENCIA_SUFICIENTE = 60;

// Modelo escolhido em 2026-07-30 apos consultar a documentacao oficial
// (ai.google.dev/gemini-api/docs/{models,pricing,deprecations}): gemini-2.5-flash
// tem shutdown agendado para 2026-10-16, substituto recomendado e
// gemini-3.6-flash - estavel (nao preview), multimodal, gratuito no free tier.
// Nao trocar sem reconferir a pagina de deprecations do Google antes.
export const GEMINI_MODEL = "gemini-3.6-flash";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_FOTO_BYTES = 8 * 1024 * 1024; // limite defensivo por foto, bem abaixo do limite de 20MB da requisicao inteira
const TIMEOUT_DOWNLOAD_MS = 20_000;
const TIMEOUT_GEMINI_MS = 90_000;

interface FotoBaixada {
  data: string; // base64
  mimeType: string;
}

/**
 * Baixa uma foto para memoria (buffer), converte para base64 e descarta -
 * nunca grava em disco nem no Neon (regra 6 do pedido). Retorna null em
 * qualquer falha (foto fora do ar, tipo invalido, etc) sem interromper a
 * investigacao do anuncio inteiro.
 */
async function baixarFotoBase64(url: string): Promise<FotoBaixada | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_DOWNLOAD_MS);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) return null;

      const contentType = resp.headers.get("content-type") ?? "";
      const mimeType = contentType.split(";")[0].trim();
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) return null;

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_FOTO_BYTES) return null;

      return { data: buffer.toString("base64"), mimeType: mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

export function extrairTextoDaResposta(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const steps = (body as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;

  const textos: string[] = [];
  for (const step of steps) {
    if (typeof step !== "object" || step === null) continue;
    if ((step as { type?: unknown }).type !== "model_output") continue;
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") textos.push(text);
      }
    }
  }
  return textos.length > 0 ? textos.join("") : null;
}

export function validarResultado(json: unknown): InvestigacaoResultado | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  const status = obj.status;
  if (status !== "localizado" && status !== "parcial" && status !== "nao_localizado") return null;
  if (typeof obj.confianca !== "number") return null;

  return aplicarRegraDeConfianca({
    condominio: typeof obj.condominio === "string" ? obj.condominio : "",
    endereco: typeof obj.endereco === "string" ? obj.endereco : "",
    bairro: typeof obj.bairro === "string" ? obj.bairro : "",
    cidade: typeof obj.cidade === "string" ? obj.cidade : "",
    confianca: Math.max(0, Math.min(100, Math.round(obj.confianca))),
    status,
    evidencias: Array.isArray(obj.evidencias) ? obj.evidencias.filter((e): e is string => typeof e === "string") : [],
    fontes: Array.isArray(obj.fontes) ? obj.fontes.filter((f): f is string => typeof f === "string") : [],
    divergencias: Array.isArray(obj.divergencias) ? obj.divergencias.filter((d): d is string => typeof d === "string") : [],
    criterioConfirmacao: typeof obj.criterio_confirmacao === "string" ? obj.criterio_confirmacao : "",
  });
}

/**
 * Rede de seguranca deterministica para a regra 9 do ajuste pedido: com
 * menos de 2 evidencias, o status nunca pode ser "localizado" e a confianca
 * e limitada. Nao confia cegamente na instrucao de prompt - o Gemini pode
 * "esquecer" a regra, entao ela e reaplicada aqui em codigo.
 */
export function aplicarRegraDeConfianca(resultado: InvestigacaoResultado): InvestigacaoResultado {
  if (resultado.evidencias.length >= MINIMO_EVIDENCIAS_PARA_ALTA_CONFIANCA) {
    return resultado;
  }
  return {
    ...resultado,
    status: resultado.status === "localizado" ? "parcial" : resultado.status,
    confianca: Math.min(resultado.confianca, TETO_CONFIANCA_SEM_EVIDENCIA_SUFICIENTE),
  };
}

/**
 * Baixa as fotos selecionadas e chama a Gemini API pedindo saida estruturada
 * (regra 8). A GEMINI_API_KEY so e lida de process.env aqui dentro, enviada
 * via header (nunca na URL, para nao aparecer em logs de proxy/CDN) e nunca
 * incluida em nenhuma mensagem de erro, log ou valor de retorno (regra 1/2).
 */
export async function investigarComGemini(
  listing: ListingParaInvestigar,
  detalhe: DetalheExtraido,
  evidenciasExternas: EvidenciaExterna[] = []
): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      resultado: null,
      usage: { totalInputTokens: null, totalOutputTokens: null, totalTokens: null },
      modelo: GEMINI_MODEL,
      erro: "GEMINI_API_KEY nao configurada no ambiente",
    };
  }

  const fotosBaixadas = (await Promise.all(detalhe.fotos.map((f) => baixarFotoBase64(f.url)))).filter(
    (f): f is FotoBaixada => f !== null
  );

  const promptTexto = montarPromptTexto(listing, detalhe, evidenciasExternas);
  const input: unknown[] = [{ type: "text", text: promptTexto }];
  for (const foto of fotosBaixadas) {
    input.push({ type: "image", data: foto.data, mime_type: foto.mimeType });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_GEMINI_MS);

  try {
    const resp = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: RESPONSE_SCHEMA,
        },
      }),
    });

    const bodyJson = await resp.json().catch(() => null);

    if (!resp.ok) {
      // A API do Google pode ecoar a chave de volta em mensagens de erro de
      // autenticacao em alguns casos - nunca repassar o corpo bruto da
      // resposta de erro, so um resumo generico com o status HTTP.
      return {
        resultado: null,
        usage: { totalInputTokens: null, totalOutputTokens: null, totalTokens: null },
        modelo: GEMINI_MODEL,
        erro: `Gemini API retornou HTTP ${resp.status}`,
      };
    }

    const usage: GeminiCallResult["usage"] = {
      totalInputTokens: typeof (bodyJson as { usage?: { total_input_tokens?: unknown } })?.usage?.total_input_tokens === "number"
        ? (bodyJson as { usage: { total_input_tokens: number } }).usage.total_input_tokens
        : null,
      totalOutputTokens: typeof (bodyJson as { usage?: { total_output_tokens?: unknown } })?.usage?.total_output_tokens === "number"
        ? (bodyJson as { usage: { total_output_tokens: number } }).usage.total_output_tokens
        : null,
      totalTokens: typeof (bodyJson as { usage?: { total_tokens?: unknown } })?.usage?.total_tokens === "number"
        ? (bodyJson as { usage: { total_tokens: number } }).usage.total_tokens
        : null,
    };

    const textoResposta = extrairTextoDaResposta(bodyJson);
    if (!textoResposta) {
      return { resultado: null, usage, modelo: GEMINI_MODEL, erro: "resposta da Gemini nao trouxe texto (formato inesperado)" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textoResposta);
    } catch {
      return { resultado: null, usage, modelo: GEMINI_MODEL, erro: "resposta da Gemini nao e um JSON valido" };
    }

    const resultado = validarResultado(parsed);
    if (!resultado) {
      return { resultado: null, usage, modelo: GEMINI_MODEL, erro: "JSON da Gemini nao bate com o schema esperado" };
    }

    return { resultado, usage, modelo: GEMINI_MODEL, erro: null };
  } catch (err) {
    return {
      resultado: null,
      usage: { totalInputTokens: null, totalOutputTokens: null, totalTokens: null },
      modelo: GEMINI_MODEL,
      erro: err instanceof Error ? err.message : "falha desconhecida ao chamar a Gemini API",
    };
  } finally {
    clearTimeout(timeout);
  }
}
