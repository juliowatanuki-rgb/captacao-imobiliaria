import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { createImoviewCrawler } from "./imoview.js";

const urlBase = "https://www.exemplo.com.br";
const urlListagem = "https://www.exemplo.com.br/venda/imovel/praia-grande";

function mockPage(goto: Page["goto"]): Page {
  return {
    goto,
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue([]),
  } as unknown as Page;
}

describe("createImoviewCrawler - navegacao", () => {
  it("usa commit e repete uma vez quando a navegacao falha transitoriamente", async () => {
    const goto = vi.fn()
      .mockRejectedValueOnce(new Error("navigation timeout"))
      .mockResolvedValueOnce(null);
    const page = mockPage(goto as unknown as Page["goto"]);
    const crawler = createImoviewCrawler({ urlListagem, maxPaginas: 1 });

    const result = await crawler.scrape({ page, urlBase, urlListagem });

    expect(result).toEqual({ listings: [], paginasVisitadas: 1 });
    expect(goto).toHaveBeenCalledTimes(2);
    expect(goto).toHaveBeenLastCalledWith(`${urlListagem}?pagina=1`, {
      waitUntil: "commit",
      timeout: 30_000,
    });
    expect(page.waitForTimeout).toHaveBeenCalledWith(1_500);
  });

  it("propaga a falha se a segunda navegacao tambem falhar", async () => {
    const erro = new Error("navigation timeout");
    const page = mockPage(vi.fn().mockRejectedValue(erro) as unknown as Page["goto"]);
    const crawler = createImoviewCrawler({ urlListagem, maxPaginas: 1 });

    await expect(crawler.scrape({ page, urlBase, urlListagem })).rejects.toThrow("navigation timeout");
    expect(page.goto).toHaveBeenCalledTimes(2);
  });
});
