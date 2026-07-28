import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { resolveIdentity } from "@captacao/crawler-core";
import { createPraediumCrawler } from "./praedium.js";

const urlBase = "https://www.exemplo.com.br";
const urlListagem = "https://www.exemplo.com.br/imoveis/a-venda";

interface RawCardFixture {
  href: string;
  titulo: string;
  endereco: string | null;
  preco: string;
  dados: string[];
}

function mockPage(pagesOfCards: RawCardFixture[][]): Page {
  let call = 0;
  const evaluate = vi.fn().mockImplementation(async () => {
    const cards = pagesOfCards[call] ?? [];
    call += 1;
    return cards;
  });
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate,
  } as unknown as Page;
}

const cardApartamento: RawCardFixture = {
  href: "https://www.exemplo.com.br/imovel/apartamento-a-venda-2-quartos-guilhermina-praia-grande-sp-83m2-id-4312",
  titulo: "Apartamento à Venda com 2 quartos, 83m²",
  endereco: "Guilhermina, Praia Grande-SP",
  preco: "R$ 895.000",
  dados: ["2 Quartos", "1 Banheiro", "1 Vaga", "83 m²"],
};

const cardKitnetSemVaga: RawCardFixture = {
  href: "https://www.exemplo.com.br/imovel/kitnet-a-venda-25m2-id-4870",
  titulo: "Kitnet à Venda, 25m²",
  endereco: "Aviação, Praia Grande-SP",
  preco: "R$ 215.000",
  dados: ["1 Banheiro", "25 m²"],
};

describe("createPraediumCrawler - paginacao", () => {
  it("para na primeira pagina sem cards, sem exceder o limite configurado", async () => {
    const page = mockPage([[cardApartamento], [cardKitnetSemVaga], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    const result = await crawler.scrape({ page, urlBase, urlListagem });

    expect(result.paginasVisitadas).toBe(3);
    expect(result.listings).toHaveLength(2);
    expect(page.goto).toHaveBeenCalledTimes(3);
  });

  it("respeita o maxPaginas quando o site nunca retorna pagina vazia", async () => {
    const page = mockPage([[cardApartamento], [cardApartamento], [cardApartamento], [cardApartamento]]);
    const crawler = createPraediumCrawler({ urlListagem, maxPaginas: 2 });

    const result = await crawler.scrape({ page, urlBase, urlListagem });

    expect(result.paginasVisitadas).toBe(2);
    expect(result.listings).toHaveLength(2);
  });

  it("monta a url de cada pagina com ?pagina=N", async () => {
    const page = mockPage([[cardApartamento], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    await crawler.scrape({ page, urlBase, urlListagem });

    expect(page.goto).toHaveBeenNthCalledWith(1, `${urlListagem}?pagina=1`, expect.anything());
    expect(page.goto).toHaveBeenNthCalledWith(2, `${urlListagem}?pagina=2`, expect.anything());
  });
});

describe("createPraediumCrawler - extracao de campos", () => {
  it("extrai codigo (do final da url), tipo, bairro, cidade, preco e numeros do card completo", async () => {
    const page = mockPage([[cardApartamento], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page, urlBase, urlListagem });

    expect(listings).toEqual([
      expect.objectContaining({
        externalId: "4312",
        urlOriginal: cardApartamento.href,
        tipoImovel: "Apartamento",
        bairro: "Guilhermina",
        cidade: "Praia Grande",
        preco: 895000,
        areaUtil: 83,
        dormitorios: 2,
        banheiros: 1,
        vagas: 1,
      }),
    ]);
  });

  it("lida com cards sem quartos/vagas (ex: kitnet) sem quebrar, retornando null nesses campos", async () => {
    const page = mockPage([[cardKitnetSemVaga], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page, urlBase, urlListagem });

    expect(listings[0]).toEqual(
      expect.objectContaining({
        externalId: "4870",
        tipoImovel: "Kitnet",
        dormitorios: null,
        vagas: null,
        banheiros: 1,
        areaUtil: 25,
      })
    );
  });

  it("ignora cards sem link (defensivo contra HTML inesperado)", async () => {
    const page = mockPage([[{ ...cardApartamento, href: "" }], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page, urlBase, urlListagem });

    expect(listings).toHaveLength(0);
  });
});

describe("createPraediumCrawler - identidade e prevencao de duplicidade", () => {
  it("gera a mesma identity_key para o mesmo anuncio revisitado em duas coletas", async () => {
    const page1 = mockPage([[cardApartamento], []]);
    const page2 = mockPage([[{ ...cardApartamento, preco: "R$ 900.000" }], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    const first = await crawler.scrape({ page: page1, urlBase, urlListagem });
    const second = await crawler.scrape({ page: page2, urlBase, urlListagem });

    const identityFirst = resolveIdentity(first.listings[0], urlBase);
    const identitySecond = resolveIdentity(second.listings[0], urlBase);

    expect(identityFirst.identityType).toBe("external");
    expect(identityFirst.identityKey).toBe(identitySecond.identityKey);
  });

  it("gera identity_key diferente para anuncios com codigos diferentes", async () => {
    const page = mockPage([[cardApartamento, cardKitnetSemVaga], []]);
    const crawler = createPraediumCrawler({ urlListagem });

    const { listings } = await crawler.scrape({ page, urlBase, urlListagem });
    const keys = listings.map((l) => resolveIdentity(l, urlBase).identityKey);

    expect(new Set(keys).size).toBe(2);
  });
});
