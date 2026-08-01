import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { createImobealCrawler } from "./imobeal.js";

const urlListagem = "https://www.exemplo.com.br/comprar";

interface RawCardFixture {
  href: string;
  titulo: string | null;
  localizacao: string | null;
  precoTexto: string;
  itens: string[];
}

function card(id8: string, overrides: Partial<RawCardFixture> = {}): RawCardFixture {
  return {
    href: `https://www.exemplo.com.br/imoveis/${id8}-apartamento-2-quartos-boqueirao`,
    titulo: "Apartamento 2 quartos",
    localizacao: "Praia Grande - Boqueirão",
    precoTexto: "R$ 420.000",
    itens: ["2 dorm.", "1 banh.", "1 vaga(s)", "60 m2"],
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
  const proximoBotao = {
    getAttribute: vi.fn().mockResolvedValue(null), // nunca desabilitado nos testes (fim controlado por pagina vazia)
    click: vi.fn().mockResolvedValue(undefined),
  };
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    getByRole: vi.fn().mockReturnValue(proximoBotao),
    evaluate,
  } as unknown as Page;
}

describe("createImobealCrawler - extracao basica", () => {
  it("extrai os cards de uma pagina estavel (href nao muda na confirmacao) e para na pagina vazia", async () => {
    const paginaEstavel = [card("AAAAAAAA"), card("BBBBBBBB")];
    // pagina 1: leitura inicial + 1 confirmacao com o mesmo href (estabiliza de primeira)
    // pagina 2: vazia
    const page = mockPage([paginaEstavel, paginaEstavel, []]);
    const crawler = createImobealCrawler({ urlListagem });

    const { listings, paginasVisitadas } = await crawler.scrape({ page } as any);

    expect(paginasVisitadas).toBe(2);
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.externalId)).toEqual(["AAAAAAAA", "BBBBBBBB"]);
    expect(listings[0]).toMatchObject({ cidade: "Praia Grande", bairro: "Boqueirão", preco: 420000 });
  });

  it("descarta cidades fora de Praia Grande e do litoral coberto pelo texto de localizacao", async () => {
    const cardOutraCidade = card("CCCCCCCC", { localizacao: "Santos - Gonzaga" });
    const page = mockPage([[cardOutraCidade], [cardOutraCidade], []]);
    const crawler = createImobealCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page } as any);

    expect(listings).toHaveLength(0);
  });
});

describe("createImobealCrawler - protecao contra href instavel (churn de identidade)", () => {
  it("pula o conteudo da pagina quando o href nunca estabiliza, mas continua clicando/paginando", async () => {
    // pagina 1: leitura inicial + 2 confirmacoes, todas com hrefs diferentes -> nunca estabiliza
    const page = mockPage([
      [card("AAAAAAAA")], // leitura inicial
      [card("BBBBBBBB")], // 1a confirmacao (diferente - instavel)
      [card("CCCCCCCC")], // 2a confirmacao (diferente da anterior - continua instavel)
      [card("DDDDDDDD")], // pagina 2: leitura inicial
      [card("DDDDDDDD")], // pagina 2: 1a confirmacao (igual - estavel)
      // pagina 3: vazia via fallback do mock
    ]);
    const crawler = createImobealCrawler({ urlListagem });

    const { listings, paginasVisitadas } = await crawler.scrape({ page } as any);

    // nada da pagina 1 (nunca confiavel), so o anuncio da pagina 2 (estavel)
    expect(listings.map((l) => l.externalId)).toEqual(["DDDDDDDD"]);
    expect(paginasVisitadas).toBe(3);
    // apesar da pagina 1 ter sido descartada, o crawler ainda clicou em "Proxima" pra seguir paginando
    expect(page.getByRole).toHaveBeenCalled();
  });

  it("usa o href confirmado (nao o transitorio) quando estabiliza so na 2a confirmacao", async () => {
    const page = mockPage([
      [card("AAAAAAAA")], // leitura inicial
      [card("BBBBBBBB")], // 1a confirmacao (diferente - instavel)
      [card("BBBBBBBB")], // 2a confirmacao (igual a 1a - estabiliza)
      [], // pagina 2 vazia
    ]);
    const crawler = createImobealCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page } as any);

    expect(listings).toHaveLength(1);
    expect(listings[0].externalId).toBe("BBBBBBBB");
  });
});
