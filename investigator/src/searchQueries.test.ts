import { describe, expect, it } from "vitest";
import { gerarConsultasBusca } from "./searchQueries.js";
import type { DetalheExtraido, ListingParaInvestigar } from "./types.js";

const listingBase: ListingParaInvestigar = {
  listingId: "id-1",
  siteId: "site-1",
  siteNome: "Nova Casarao Imoveis",
  codigoImovel: "AP34453-NOW9",
  urlOriginal: "https://www.novacasarao.com.br/imovel/apartamento-praia-grande-2-quartos-86-m/AP34453-NOW9?from=sale",
  urlFinal: null,
  titulo: "Apartamento",
  descricao: null,
  bairro: "Boqueirão",
  areaUtil: 86,
  preco: 1060000,
  condominioNome: null,
  dormitorios: 2,
  suites: null,
  vagas: null,
};

const detalheVazio: DetalheExtraido = { condominioValorTexto: null, iptuValorTexto: null, fotos: [], erro: null };

describe("gerarConsultasBusca", () => {
  it("gera consulta com metragem, dormitorios, bairro e cidade", () => {
    const consultas = gerarConsultasBusca(listingBase, detalheVazio);
    expect(consultas.some((q) => q.includes("86 m²") && q.includes("Boqueirão"))).toBe(true);
  });

  it("gera consulta com codigo do imovel e nome da imobiliaria", () => {
    const consultas = gerarConsultasBusca(listingBase, detalheVazio);
    expect(consultas.some((q) => q.includes("AP34453-NOW9") && q.includes("Nova Casarao Imoveis"))).toBe(true);
  });

  it("gera consulta com valor de condominio e IPTU quando disponiveis", () => {
    const detalhe: DetalheExtraido = { ...detalheVazio, condominioValorTexto: "R$ 500,00", iptuValorTexto: "R$ 80,00" };
    const consultas = gerarConsultasBusca(listingBase, detalhe);
    expect(consultas.some((q) => q.includes("R$ 500,00") && q.includes("R$ 80,00"))).toBe(true);
  });

  it("nao gera consulta de condominio+IPTU quando um dos dois falta", () => {
    const detalhe: DetalheExtraido = { ...detalheVazio, condominioValorTexto: "R$ 500,00", iptuValorTexto: null };
    const consultas = gerarConsultasBusca(listingBase, detalhe);
    expect(consultas.some((q) => q.includes("R$ 500,00"))).toBe(false);
  });

  it("usa um trecho literal da descricao entre aspas quando ha frase longa o suficiente", () => {
    const listing = { ...listingBase, descricao: "Apartamento reformado com vista para o mar e area de lazer completa." };
    const consultas = gerarConsultasBusca(listing, detalheVazio);
    expect(consultas[0]).toBe('"Apartamento reformado com vista para o mar e area de lazer completa."');
  });

  it("ignora frases curtas demais da descricao (genericas demais para busca entre aspas)", () => {
    const listing = { ...listingBase, descricao: "Otimo apartamento!" };
    const consultas = gerarConsultasBusca(listing, detalheVazio);
    expect(consultas.some((q) => q.includes("Otimo apartamento"))).toBe(false);
  });

  it("nunca gera mais que 6 consultas e nunca duplica", () => {
    const listing: ListingParaInvestigar = {
      ...listingBase,
      descricao: "Apartamento amplo e reformado, com vista livre para o mar e area de lazer completa no condominio.",
      suites: 1,
      vagas: 2,
    };
    const detalhe: DetalheExtraido = { ...detalheVazio, condominioValorTexto: "R$ 600,00", iptuValorTexto: "R$ 90,00" };
    const consultas = gerarConsultasBusca(listing, detalhe);
    expect(consultas.length).toBeLessThanOrEqual(6);
    expect(new Set(consultas.map((q) => q.toLowerCase())).size).toBe(consultas.length);
  });

  it("nao quebra quando faltam quase todos os dados", () => {
    const listing: ListingParaInvestigar = {
      ...listingBase,
      bairro: null,
      areaUtil: null,
      preco: null,
      dormitorios: null,
      suites: null,
      vagas: null,
      codigoImovel: null,
    };
    expect(() => gerarConsultasBusca(listing, detalheVazio)).not.toThrow();
  });
});
