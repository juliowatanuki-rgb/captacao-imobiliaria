import { describe, expect, it } from "vitest";
import { extrairEvidenciaExterna, extrairPossivelCondominio, extrairPossivelEndereco, identificarCamposCoincidentes } from "./searchEvidence.js";
import type { DetalheExtraido, ListingParaInvestigar, ResultadoBusca } from "./types.js";

describe("extrairPossivelCondominio", () => {
  it("reconhece 'Residencial' seguido de nome proprio, mesmo com conectores minusculos (de/da/do)", () => {
    expect(extrairPossivelCondominio("Residencial Ilha de Salina - Boqueirao - Viva Real")).toBe("Residencial Ilha de Salina");
  });

  it("reconhece 'Condominio'/'Edificio' em qualquer capitalizacao do rotulo", () => {
    expect(extrairPossivelCondominio("apartamentos no condomínio Vista Mar a venda")).toContain("Vista Mar");
    expect(extrairPossivelCondominio("Edifício Aurora, unidade reformada")).toContain("Aurora");
  });

  it("nao gera falso positivo em texto sem nome de condominio", () => {
    expect(extrairPossivelCondominio("971 anúncios de Apartamentos com 2 quartos para venda")).toBeNull();
  });
});

describe("extrairPossivelEndereco", () => {
  it("reconhece Rua/Avenida seguida de numero", () => {
    expect(extrairPossivelEndereco("Fica na Rua Duque de Caxias, 93, Boqueirão, Praia Grande/SP")).toBe("Rua Duque de Caxias, 93");
    expect(extrairPossivelEndereco("Av. Presidente Kennedy, 1500, Boqueirão")).toBe("Av. Presidente Kennedy, 1500");
  });

  it("retorna null quando nao ha endereco explicito com numero", () => {
    expect(extrairPossivelEndereco("Apartamento no bairro Boqueirão, perto da praia")).toBeNull();
  });
});

const listing: ListingParaInvestigar = {
  listingId: "id-1",
  siteId: "site-1",
  siteNome: "Nova Casarao Imoveis",
  codigoImovel: "AP34453-NOW9",
  urlOriginal: "https://exemplo.com/imovel/1",
  urlFinal: null,
  titulo: "Apartamento",
  descricao: null,
  bairro: "Boqueirão",
  areaUtil: 86,
  preco: 1060000,
  condominioNome: null,
  dormitorios: 2,
  suites: 1,
  vagas: 2,
};

const detalheVazio: DetalheExtraido = { condominioValorTexto: null, iptuValorTexto: null, fotos: [], erro: null };

describe("identificarCamposCoincidentes", () => {
  it("identifica metragem, dormitorios, suites e vagas quando o texto bate", () => {
    const texto = "Apartamento de 86 m² com 2 dormitorios, 1 suite e 2 vagas de garagem";
    const campos = identificarCamposCoincidentes(texto, listing, detalheVazio);
    expect(campos).toEqual(expect.arrayContaining(["metragem", "dormitorios", "suites", "vagas"]));
  });

  it("nao marca campo como coincidente quando o numero e diferente", () => {
    const texto = "Apartamento de 120 m² com 3 dormitorios";
    const campos = identificarCamposCoincidentes(texto, listing, detalheVazio);
    expect(campos).not.toContain("metragem");
    expect(campos).not.toContain("dormitorios");
  });

  it("identifica valor de condominio e IPTU quando batem", () => {
    const detalhe: DetalheExtraido = { ...detalheVazio, condominioValorTexto: "R$ 748,00", iptuValorTexto: "R$ 363,00" };
    const texto = "condomínio por R$ 748,00, IPTU por R$ 363,00";
    const campos = identificarCamposCoincidentes(texto, listing, detalhe);
    expect(campos).toEqual(expect.arrayContaining(["valor_condominio", "valor_iptu"]));
  });

  it("identifica preco exato quando presente no texto", () => {
    const texto = "Apartamento a venda por R$ 1.060.000";
    const campos = identificarCamposCoincidentes(texto, listing, detalheVazio);
    expect(campos).toContain("preco");
  });

  it("retorna lista vazia quando nada bate", () => {
    const texto = "Casa terrea em outro bairro, sem nenhuma caracteristica em comum";
    expect(identificarCamposCoincidentes(texto, listing, detalheVazio)).toEqual([]);
  });
});

describe("extrairEvidenciaExterna", () => {
  it("combina titulo+trecho e devolve condominio/endereco/campos coincidentes", () => {
    const resultado: ResultadoBusca = {
      consulta: "consulta teste",
      titulo: "Residencial Ilha de Salina - Boqueirao",
      trecho: "Apartamento de 86 m² no Residencial Ilha de Salina, Rua Duque de Caxias, 93, Boqueirão",
      url: "https://exemplo.com/x",
    };
    const evidencia = extrairEvidenciaExterna(resultado, listing, detalheVazio);
    expect(evidencia.possivelCondominio).toContain("Ilha de Salina");
    expect(evidencia.possivelEndereco).toBe("Rua Duque de Caxias, 93");
    expect(evidencia.camposCoincidentes).toContain("metragem");
  });
});
