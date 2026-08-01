import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { createImobziCrawler } from "./imobzi.js";

const urlListagem = "https://www.exemplo.com.br/buscar?availability=buy&city=Praia%20Grande";

interface RawCardFixture {
  href: string;
  codigoTexto: string | null;
  tituloAttr: string | null;
  precoTexto: string;
  icones: { titulo: string | null; texto: string }[];
}

function card(codigo: string, overrides: Partial<RawCardFixture> = {}): RawCardFixture {
  return {
    href: `https://www.exemplo.com.br/imovel/apartamento-2-quartos-aviacao-praia-grande-1-vaga-code-${codigo}`,
    codigoTexto: `Aviação - Cód. ${codigo}`,
    tituloAttr: "Apartamento 2 dorms em Aviação",
    precoTexto: "R$ 350.000",
    icones: [
      { titulo: "Dormitorios", texto: "2" },
      { titulo: "Vagas", texto: "1" },
    ],
    ...overrides,
  };
}

/** Cada item de `leituras` e o retorno de UMA chamada a page.evaluate (1 leitura de extractCards). */
function mockPage(leituras: RawCardFixture[][]): Page {
  let chamada = 0;
  const evaluate = vi.fn().mockImplementation(async () => {
    const resultado = leituras[chamada] ?? [];
    chamada += 1;
    return resultado;
  });
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate,
  } as unknown as Page;
}

describe("createImobziCrawler - paginacao e extracao basica", () => {
  it("extrai os cards de uma pagina estavel (leitura inicial == confirmacao) e para na pagina vazia", async () => {
    const paginaEstavel = [card("ACTA100"), card("ACTA101")];
    // pagina 1: leitura inicial + 1 confirmacao identica (estabiliza na 1a confirmacao)
    // pagina 2: leitura vazia
    const page = mockPage([paginaEstavel, paginaEstavel, []]);
    const crawler = createImobziCrawler({ urlListagem });

    const { listings, paginasVisitadas } = await crawler.scrape({ page } as any);

    expect(paginasVisitadas).toBe(2);
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.externalId)).toEqual(["ACTA100", "ACTA101"]);
    expect(listings[0]).toMatchObject({ bairro: "Aviação", preco: 350000, dormitorios: 2, vagas: 1 });
  });

  it("reconhece o template antigo (Cod: X, sem bairro) e cai para o bairro do title attr", async () => {
    const cardAntigo = card("991", {
      codigoTexto: "Cod: 991",
      tituloAttr: "Apartamento em Boqueirão - Praia Grande, SP",
    });
    const page = mockPage([[cardAntigo], [cardAntigo], []]);
    const crawler = createImobziCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page } as any);

    expect(listings[0]).toMatchObject({ externalId: "991", bairro: "Boqueirão" });
  });

  it("descarta cards fora de Praia Grande (rede nacional) pelo href", async () => {
    const cardOutraCidade = card("XYZ1", {
      href: "https://www.exemplo.com.br/imovel/apartamento-em-santos-code-XYZ1",
    });
    const page = mockPage([[cardOutraCidade], [cardOutraCidade], []]);
    const crawler = createImobziCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page } as any);

    expect(listings).toHaveLength(0);
  });
});

describe("createImobziCrawler - protecao contra codigo instavel (churn de identidade)", () => {
  it("descarta a leitura inicial quando o codigo muda na confirmacao e usa a leitura estavel seguinte", async () => {
    // pagina 1, tentativa 1: leitura inicial ACT100Z, 2 confirmacoes (ACT100Y, ACT100X) - nunca batem entre si -> instavel, descarta
    // pagina 1, tentativa 2 (reload): leitura inicial ACT100, 1a confirmacao tambem ACT100 -> estavel, aceita
    // pagina 2: vazia (via fallback do mock, nao precisa listar explicitamente)
    const page = mockPage([
      [card("ACT100Z")], // tentativa 1: leitura inicial
      [card("ACT100Y")], // tentativa 1: 1a confirmacao (diferente da inicial - instavel)
      [card("ACT100X")], // tentativa 1: 2a confirmacao (diferente da 1a - continua instavel, esgota tentativa)
      [card("ACT100")], // tentativa 2: leitura inicial (reload)
      [card("ACT100")], // tentativa 2: 1a confirmacao (igual - estavel, nao precisa da 2a)
    ]);
    const crawler = createImobziCrawler({ urlListagem });

    const { listings, paginasVisitadas } = await crawler.scrape({ page } as any);

    expect(listings).toHaveLength(1);
    expect(listings[0].externalId).toBe("ACT100"); // ficou com o codigo que se confirmou estavel, nao o transitorio
    expect(paginasVisitadas).toBe(2); // pagina 1 (estabilizou na 2a tentativa) + pagina 2 (vazia, fim real)
  });

  it("pula o conteudo da pagina (sem gravar nenhum anuncio dela) quando o codigo nunca estabiliza em nenhuma das 3 tentativas, mas CONTINUA paginando", async () => {
    // pagina 1: instavel nas 3 tentativas - cada uma faz 1 leitura inicial + ate
    // 2 confirmacoes, todas mutuamente diferentes (nunca estabiliza) = 3 leituras x 3 tentativas = 9
    const page = mockPage([
      [card("A1")], [card("A2")], [card("A3")], // tentativa 1
      [card("A4")], [card("A5")], [card("A6")], // tentativa 2
      [card("A7")], [card("A8")], [card("A9")], // tentativa 3
      [card("B1")], [card("B1")], // pagina 2: estavel logo na 1a confirmacao
      // pagina 3: vazia via fallback do mock
    ]);
    const crawler = createImobziCrawler({ urlListagem });

    const { listings, paginasVisitadas } = await crawler.scrape({ page } as any);

    // nenhum anuncio da pagina 1 (nunca confiavel o suficiente para gravar),
    // mas a pagina 2 (depois dela) foi normalmente coletada - a paginacao
    // NAO parou so porque uma pagina no meio nunca estabilizou.
    expect(listings.map((l) => l.externalId)).toEqual(["B1"]);
    expect(paginasVisitadas).toBe(3); // pagina 1 (pulada) + pagina 2 (coletada) + pagina 3 (vazia, fim real)
  });

  it("para de paginar quando a pagina esta REALMENTE vazia em todas as tentativas (fim real da paginacao)", async () => {
    const page = mockPage([[card("A1")], [card("A1")]]); // pagina 1 estavel; pagina 2 vazia via fallback
    const crawler = createImobziCrawler({ urlListagem, maxPaginas: 10 });

    const { paginasVisitadas } = await crawler.scrape({ page } as any);

    // pagina 1 estavel (2 leituras), pagina 2 vazia -> encerra sem tentar pagina 3
    expect(paginasVisitadas).toBe(2);
  });
});
