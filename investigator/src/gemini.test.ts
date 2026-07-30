import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aplicarRegraDeConfianca, extrairTextoDaResposta, investigarComGemini, validarResultado } from "./gemini.js";
import type { DetalheExtraido, InvestigacaoResultado, ListingParaInvestigar } from "./types.js";

describe("validarResultado", () => {
  it("aceita um resultado valido completo com 2 evidencias (confianca alta preservada)", () => {
    const resultado = validarResultado({
      condominio: "Edificio Sol",
      endereco: "Rua X, 100",
      bairro: "Boqueirao",
      cidade: "Praia Grande",
      confianca: 87,
      status: "localizado",
      evidencias: ["placa com nome legivel", "mesmos valores de condominio e IPTU em fonte externa"],
      fontes: ["foto da fachada", "https://exemplo.com/anuncio-espelho"],
      divergencias: [],
      criterio_confirmacao: "nome na placa + valores batendo com anuncio espelho",
    });
    expect(resultado?.status).toBe("localizado");
    expect(resultado?.confianca).toBe(87);
    expect(resultado?.criterioConfirmacao).toBe("nome na placa + valores batendo com anuncio espelho");
  });

  it("rejeita status fora do enum permitido", () => {
    expect(validarResultado({ status: "confirmado", confianca: 90 })).toBeNull();
  });

  it("rejeita quando confianca nao e numero", () => {
    expect(validarResultado({ status: "parcial", confianca: "alta" })).toBeNull();
  });

  it("limita confianca ao intervalo 0-100", () => {
    const resultado = validarResultado({
      status: "parcial",
      confianca: 150,
      evidencias: ["a", "b"],
      fontes: [],
      divergencias: [],
      criterio_confirmacao: "",
    });
    expect(resultado?.confianca).toBe(100);
  });

  it("preenche strings/arrays ausentes como vazio em vez de falhar", () => {
    const resultado = validarResultado({ status: "nao_localizado", confianca: 0 });
    expect(resultado).toEqual({
      condominio: "",
      endereco: "",
      bairro: "",
      cidade: "",
      confianca: 0,
      status: "nao_localizado",
      evidencias: [],
      fontes: [],
      divergencias: [],
      criterioConfirmacao: "",
    });
  });

  it("rebaixa 'localizado' com menos de 2 evidencias para 'parcial' e limita a confianca (regra 9)", () => {
    const resultado = validarResultado({
      status: "localizado",
      confianca: 95,
      evidencias: ["so uma evidencia isolada"],
      fontes: [],
      divergencias: [],
      criterio_confirmacao: "",
    });
    expect(resultado?.status).toBe("parcial");
    expect(resultado?.confianca).toBeLessThanOrEqual(60);
  });
});

describe("aplicarRegraDeConfianca", () => {
  const base: InvestigacaoResultado = {
    condominio: "",
    endereco: "",
    bairro: "",
    cidade: "",
    confianca: 90,
    status: "localizado",
    evidencias: [],
    fontes: [],
    divergencias: [],
    criterioConfirmacao: "",
  };

  it("mantem 'localizado' com 2+ evidencias", () => {
    const resultado = aplicarRegraDeConfianca({ ...base, evidencias: ["forte 1", "forte 2"] });
    expect(resultado.status).toBe("localizado");
    expect(resultado.confianca).toBe(90);
  });

  it("nunca deixa 'localizado' passar com 0 ou 1 evidencia", () => {
    expect(aplicarRegraDeConfianca({ ...base, evidencias: [] }).status).toBe("parcial");
    expect(aplicarRegraDeConfianca({ ...base, evidencias: ["uma so"] }).status).toBe("parcial");
  });

  it("nao mexe em status que ja e nao_localizado/parcial", () => {
    const resultado = aplicarRegraDeConfianca({ ...base, status: "nao_localizado", evidencias: [] });
    expect(resultado.status).toBe("nao_localizado");
  });
});

describe("extrairTextoDaResposta", () => {
  it("concatena os textos dos steps model_output", () => {
    const body = {
      steps: [
        { type: "thought", signature: "xyz" },
        { type: "model_output", content: [{ type: "text", text: '{"status":"parcial"}' }] },
      ],
    };
    expect(extrairTextoDaResposta(body)).toBe('{"status":"parcial"}');
  });

  it("retorna null quando nao ha step model_output", () => {
    expect(extrairTextoDaResposta({ steps: [{ type: "thought" }] })).toBeNull();
  });

  it("retorna null para corpo malformado", () => {
    expect(extrairTextoDaResposta(null)).toBeNull();
    expect(extrairTextoDaResposta("texto")).toBeNull();
  });
});

const listing: ListingParaInvestigar = {
  listingId: "id-1",
  siteId: "site-1",
  siteNome: "Imobiliaria Teste",
  codigoImovel: "COD1",
  urlOriginal: "https://exemplo.com/imovel/1",
  urlFinal: null,
  titulo: "Apartamento",
  descricao: "descricao",
  bairro: "Boqueirao",
  areaUtil: 60,
  preco: 300000,
  condominioNome: null,
  dormitorios: 2,
  suites: 1,
  vagas: 1,
};

const detalheSemFotos: DetalheExtraido = { condominioValorTexto: null, iptuValorTexto: null, fotos: [], erro: null };

describe("investigarComGemini", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("retorna erro sem chamar a rede quando GEMINI_API_KEY nao esta configurada", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const resultado = await investigarComGemini(listing, detalheSemFotos);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resultado.resultado).toBeNull();
    expect(resultado.erro).toContain("GEMINI_API_KEY");
  });

  it("envia a chave apenas no header (nunca na URL) e faz parse do resultado estruturado", async () => {
    process.env.GEMINI_API_KEY = "chave-secreta-de-teste";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { total_input_tokens: 500, total_output_tokens: 80, total_tokens: 580 },
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  condominio: "",
                  endereco: "",
                  bairro: "Boqueirao",
                  cidade: "Praia Grande",
                  confianca: 20,
                  status: "parcial",
                  evidencias: ["bairro informado bate com a descricao"],
                  fontes: ["descricao do anuncio"],
                  divergencias: [],
                  criterio_confirmacao: "evidencia unica e fraca, apenas indicativa",
                }),
              },
            ],
          },
        ],
      }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const resultado = await investigarComGemini(listing, detalheSemFotos);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toContain("chave-secreta-de-teste");
    expect(options.headers["x-goog-api-key"]).toBe("chave-secreta-de-teste");
    expect(String(options.body)).not.toContain("chave-secreta-de-teste");

    expect(resultado.erro).toBeNull();
    expect(resultado.resultado?.status).toBe("parcial");
    expect(resultado.usage.totalTokens).toBe(580);
  });

  it("marca erro quando a API responde com HTTP nao-2xx, sem vazar o corpo bruto", async () => {
    process.env.GEMINI_API_KEY = "chave-secreta-de-teste";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "quota exceeded, key=chave-secreta-de-teste" } }),
    }) as unknown as typeof fetch;

    const resultado = await investigarComGemini(listing, detalheSemFotos);

    expect(resultado.resultado).toBeNull();
    expect(resultado.erro).toBe("Gemini API retornou HTTP 429");
    expect(resultado.erro).not.toContain("chave-secreta-de-teste");
  });
});
