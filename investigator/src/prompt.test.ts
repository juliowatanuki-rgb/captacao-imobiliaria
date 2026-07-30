import { describe, expect, it } from "vitest";
import { RESPONSE_SCHEMA, montarPromptTexto } from "./prompt.js";
import type { DetalheExtraido, EvidenciaExterna, ListingParaInvestigar } from "./types.js";

const listingBase: ListingParaInvestigar = {
  listingId: "11111111-1111-1111-1111-111111111111",
  siteId: "site_teste",
  siteNome: "Imobiliaria Teste",
  codigoImovel: "ABC123",
  urlOriginal: "https://exemplo.com/imovel/abc123",
  urlFinal: null,
  titulo: "Apartamento 2 dormitorios",
  descricao: "Otimo apartamento perto da praia",
  bairro: "Boqueirao",
  areaUtil: 65,
  preco: 450000,
  condominioNome: null,
  dormitorios: 2,
  suites: 1,
  vagas: 1,
};

const detalheVazio: DetalheExtraido = {
  condominioValorTexto: null,
  iptuValorTexto: null,
  fotos: [],
  erro: null,
};

describe("RESPONSE_SCHEMA", () => {
  it("exige exatamente os campos do formato pedido", () => {
    expect(RESPONSE_SCHEMA.required).toEqual([
      "condominio",
      "endereco",
      "bairro",
      "cidade",
      "confianca",
      "status",
      "evidencias",
      "fontes",
      "divergencias",
      "criterio_confirmacao",
    ]);
  });

  it("restringe status aos 3 valores validos", () => {
    expect(RESPONSE_SCHEMA.properties.status.enum).toEqual(["localizado", "parcial", "nao_localizado"]);
  });
});

describe("montarPromptTexto", () => {
  it("inclui todos os campos do anuncio exigidos na regra 5", () => {
    const texto = montarPromptTexto(listingBase, detalheVazio);
    expect(texto).toContain("Imobiliaria Teste");
    expect(texto).toContain("ABC123");
    expect(texto).toContain("https://exemplo.com/imovel/abc123");
    expect(texto).toContain("Apartamento 2 dormitorios");
    expect(texto).toContain("Otimo apartamento perto da praia");
    expect(texto).toContain("Boqueirao");
    expect(texto).toContain("65 m²");
    expect(texto).toContain("R$ 450.000");
    expect(texto).toContain("2");
    expect(texto).toContain("1");
  });

  it("avisa quando nao ha fotos disponiveis", () => {
    const texto = montarPromptTexto(listingBase, detalheVazio);
    expect(texto).toContain("Nenhuma foto pode ser extraida");
  });

  it("lista as fotos com categoria quando presentes", () => {
    const detalhe: DetalheExtraido = {
      ...detalheVazio,
      fotos: [
        { url: "https://x.com/1.jpg", categoriaProvavel: "fachada" },
        { url: "https://x.com/2.jpg", categoriaProvavel: null },
      ],
    };
    const texto = montarPromptTexto(listingBase, detalhe);
    expect(texto).toContain("Quantidade de fotos anexadas nesta mensagem: 2");
    expect(texto).toContain("categoria provavel = fachada");
    expect(texto).toContain("categoria provavel = desconhecida");
  });

  it("inclui condominio e IPTU extraidos da pagina de detalhe", () => {
    const detalhe: DetalheExtraido = { ...detalheVazio, condominioValorTexto: "R$ 500,00", iptuValorTexto: "R$ 80,00" };
    const texto = montarPromptTexto(listingBase, detalhe);
    expect(texto).toContain("R$ 500,00");
    expect(texto).toContain("R$ 80,00");
  });

  it("avisa quando nao ha resultado de pesquisa externa", () => {
    const texto = montarPromptTexto(listingBase, detalheVazio, []);
    expect(texto).toContain("Nenhum resultado de pesquisa externa disponivel");
  });

  it("inclui titulo, URL, trecho e evidencias extraidas de cada fonte externa", () => {
    const evidencias: EvidenciaExterna[] = [
      {
        resultado: {
          consulta: '"65 m²" 2 dormitorios Boqueirao Praia Grande',
          titulo: "Residencial Sol Nascente - Boqueirao",
          url: "https://exemplo-portal.com/imovel/123",
          trecho: "Apartamento de 65 m² no Residencial Sol Nascente, Boqueirao",
        },
        possivelCondominio: "Residencial Sol Nascente",
        possivelEndereco: null,
        camposCoincidentes: ["metragem", "dormitorios"],
      },
    ];
    const texto = montarPromptTexto(listingBase, detalheVazio, evidencias);
    expect(texto).toContain("PESQUISA EXTERNA (1 resultado(s))");
    expect(texto).toContain("Residencial Sol Nascente - Boqueirao");
    expect(texto).toContain("https://exemplo-portal.com/imovel/123");
    expect(texto).toContain("metragem, dormitorios");
  });

  it("instrui explicitamente a exigir pelo menos duas evidencias independentes para confianca alta", () => {
    const texto = montarPromptTexto(listingBase, detalheVazio);
    expect(texto).toMatch(/PELO MENOS DUAS evidencias independentes/);
  });
});
