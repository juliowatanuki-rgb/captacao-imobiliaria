import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { createDamascoCrawler } from "./damasco.js";

describe("createDamascoCrawler", () => {
  it("extrai os campos e preserva o codigo estavel do anuncio", async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn()
        .mockResolvedValueOnce([{
          href: "https://damascoimoveis.com.br/imovel/apartamento/venda/praia-grande/sp/boqueirao/AP55356",
          code: "AP55356", title: "Apartamento à venda, 1 dorm, Boqueirão, Praia Grande, SP",
          price: "R$ 485.000,00", location: "Boqueirão - Praia Grande",
          features: ["1 Dorms", "1 Banho(s)", "52.54m²"],
        }])
        .mockResolvedValueOnce([]),
    } as unknown as Page;

    const result = await createDamascoCrawler().scrape({
      page, urlBase: "https://damascoimoveis.com.br", urlListagem: "https://damascoimoveis.com.br/imoveis",
    });

    expect(page.goto).toHaveBeenNthCalledWith(1,
      "https://damascoimoveis.com.br/imoveis?cidade=Praia+Grande&finalidade=venda&page=1&route=%2Fimoveis",
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    expect(result.paginasVisitadas).toBe(1);
    expect(result.listings).toEqual([expect.objectContaining({
      externalId: "AP55356", cidade: "Praia Grande", bairro: "Boqueirão",
      preco: 485000, areaUtil: 52.54, dormitorios: 1, banheiros: 1,
    })]);
  });
});
