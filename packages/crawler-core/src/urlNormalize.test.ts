import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./urlNormalize.js";

describe("normalizeUrl", () => {
  it("resolve URL relativa contra a urlBase", () => {
    const result = normalizeUrl("/imovel/123", "https://www.exemplo.com.br");
    expect(result.urlNormalizada).toBe("https://www.exemplo.com.br/imovel/123");
  });

  it("remove barra final, fragmento e deixa dominio em minusculas", () => {
    const result = normalizeUrl(
      "https://WWW.Exemplo.com.br/imovel/123/#secao",
      "https://www.exemplo.com.br"
    );
    expect(result.urlNormalizada).toBe("https://www.exemplo.com.br/imovel/123");
  });

  it("remove parametros de rastreamento mas preserva parametros identificadores, ordenados", () => {
    const result = normalizeUrl(
      "https://www.exemplo.com.br/imovel?utm_source=fb&codigo=42&id=7&fbclid=abc",
      "https://www.exemplo.com.br"
    );
    expect(result.urlNormalizada).toBe("https://www.exemplo.com.br/imovel?codigo=42&id=7");
  });

  it("preserva parametros extras especificos do site quando informados", () => {
    const result = normalizeUrl(
      "https://www.exemplo.com.br/imovel?ref_site=99",
      "https://www.exemplo.com.br",
      { extraIdentifyingParams: ["ref_site"] }
    );
    expect(result.urlNormalizada).toBe("https://www.exemplo.com.br/imovel?ref_site=99");
  });

  it("gera o mesmo hash para a mesma url normalizada e hash diferente para urls diferentes", () => {
    const a = normalizeUrl("https://www.exemplo.com.br/imovel?id=1", "https://www.exemplo.com.br");
    const b = normalizeUrl("https://www.exemplo.com.br/imovel/?id=1#x", "https://www.exemplo.com.br");
    const c = normalizeUrl("https://www.exemplo.com.br/imovel?id=2", "https://www.exemplo.com.br");

    expect(a.urlHash).toBe(b.urlHash);
    expect(a.urlHash).not.toBe(c.urlHash);
  });
});
