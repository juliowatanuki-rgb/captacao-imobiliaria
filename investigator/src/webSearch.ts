import type { ResultadoBusca } from "./types.js";

// Mecanismo de busca externa gratuita escolhido para esta POC: o endpoint
// HTML "lite" do DuckDuckGo (html.duckduckgo.com/html), sem chave/login,
// sem CAPTCHA e sem billing - unico que funciona de forma zero-config dentro
// do GitHub Actions sem exigir uma credencial nova do usuario (ver ressalvas
// de legalidade/robustez no README/plano, regra 10 do ajuste pedido).
const ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const MAX_RESULTADOS_POR_CONSULTA = 6;
const PAUSA_ENTRE_CONSULTAS_MS = 1_500;

function decodeHtmlEntities(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function removerTagsHtml(texto: string): string {
  return decodeHtmlEntities(texto.replace(/<[^>]*>/g, "")).trim();
}

/** O DuckDuckGo HTML envolve cada link em um redirect `//duckduckgo.com/l/?uddg=<url-encoded>&...` - extrai a URL real. */
function decodificarUrlReal(hrefRedirect: string): string | null {
  try {
    const url = new URL(hrefRedirect.startsWith("//") ? `https:${hrefRedirect}` : hrefRedirect);
    const alvo = url.searchParams.get("uddg");
    return alvo ? decodeURIComponent(alvo) : null;
  } catch {
    return null;
  }
}

/**
 * Faz o parse do HTML de resultados do DuckDuckGo. Funcao pura (recebe o
 * HTML ja baixado), testavel sem rede - a estrutura real ("result__a",
 * "result__snippet") foi validada manualmente contra o endpoint ao vivo
 * antes de implementar (ver plano apresentado ao usuario em 2026-07-30).
 */
export function parseResultadosHtml(html: string, consulta: string): ResultadoBusca[] {
  const resultados: ResultadoBusca[] = [];

  const blocos = html.split('class="result results_links');
  for (let i = 1; i < blocos.length; i++) {
    const bloco = blocos[i];
    const linkMatch = bloco.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    const urlReal = decodificarUrlReal(linkMatch[1]);
    if (!urlReal) continue;

    const tituloTexto = removerTagsHtml(linkMatch[2]);
    const snippetMatch = bloco.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const trecho = snippetMatch ? removerTagsHtml(snippetMatch[1]) : "";

    if (tituloTexto) {
      resultados.push({ consulta, titulo: tituloTexto, url: urlReal, trecho });
    }
    if (resultados.length >= MAX_RESULTADOS_POR_CONSULTA) break;
  }

  return resultados;
}

/**
 * Executa uma unica consulta contra o DuckDuckGo HTML. Nunca lanca excecao -
 * qualquer falha (timeout, bloqueio, mudanca de markup) vira lista vazia,
 * permitindo que a investigacao continue so com as fontes que deram certo
 * (secao 18 do projeto: isolar falha, nao propagar).
 */
async function buscarUmaConsulta(consulta: string): Promise<ResultadoBusca[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set("q", consulta);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
      if (!resp.ok) return [];
      const html = await resp.text();
      return parseResultadosHtml(html, consulta);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

/**
 * Roda todas as consultas geradas, sequencialmente e com pausa entre elas
 * (evita bater no rate-limit do DuckDuckGo - mesmo cuidado usado nos
 * crawlers de site, ver PAUSA_ENTRE_PAGINAS_MS em crawlers/src/sites/*.ts).
 */
export async function buscarResultadosExternos(consultas: string[]): Promise<ResultadoBusca[]> {
  const todos: ResultadoBusca[] = [];
  for (const consulta of consultas) {
    const resultados = await buscarUmaConsulta(consulta);
    todos.push(...resultados);
    await new Promise((resolve) => setTimeout(resolve, PAUSA_ENTRE_CONSULTAS_MS));
  }
  return todos;
}
