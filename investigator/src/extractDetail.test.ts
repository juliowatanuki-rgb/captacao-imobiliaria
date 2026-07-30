import { describe, expect, it } from "vitest";
import { classificarFoto, ehUrlDeFotoValida, extrairValorMonetario, selecionarMelhoresFotos } from "./extractDetail.js";

describe("ehUrlDeFotoValida", () => {
  it("aceita URLs de imagem http(s) validas", () => {
    expect(ehUrlDeFotoValida("https://vault.imob.online/resized/foo/bar.jpg")).toBe(true);
    expect(ehUrlDeFotoValida("https://static-sites.kenlo.io/photos/123.webp")).toBe(true);
  });

  it("rejeita URLs sem protocolo ou nao-imagem", () => {
    expect(ehUrlDeFotoValida("/relative/path.jpg")).toBe(false);
    expect(ehUrlDeFotoValida("https://example.com/pagina.html")).toBe(false);
  });

  it("rejeita logos, icones e placeholders", () => {
    expect(ehUrlDeFotoValida("https://example.com/assets/logo-empresa.png")).toBe(false);
    expect(ehUrlDeFotoValida("https://example.com/icons/favicon.png")).toBe(false);
  });
});

describe("classificarFoto", () => {
  it("identifica categoria pelo alt text", () => {
    expect(classificarFoto("https://x.com/1.jpg", "Fachada do predio").categoriaProvavel).toBe("fachada");
    expect(classificarFoto("https://x.com/2.jpg", "Vista da sacada").categoriaProvavel).toBe("vista_sacada");
  });

  it("identifica categoria pela propria URL quando falta alt", () => {
    expect(classificarFoto("https://x.com/portaria-principal.jpg", null).categoriaProvavel).toBe("portaria");
  });

  it("retorna null quando nao reconhece nenhuma categoria", () => {
    expect(classificarFoto("https://x.com/foto-generica-01.jpg", null).categoriaProvavel).toBeNull();
  });
});

describe("selecionarMelhoresFotos", () => {
  it("prioriza fotos com categoria conhecida e remove duplicadas", () => {
    const candidatas = [
      { url: "a", categoriaProvavel: null },
      { url: "b", categoriaProvavel: "fachada" },
      { url: "a", categoriaProvavel: null },
      { url: "c", categoriaProvavel: "portaria" },
    ];
    const resultado = selecionarMelhoresFotos(candidatas, 10);
    expect(resultado.map((f) => f.url)).toEqual(["b", "c", "a"]);
  });

  it("respeita o limite maximo", () => {
    const candidatas = Array.from({ length: 20 }, (_, i) => ({ url: `foto-${i}`, categoriaProvavel: null }));
    expect(selecionarMelhoresFotos(candidatas, 8)).toHaveLength(8);
  });
});

describe("extrairValorMonetario", () => {
  it("extrai o valor de condominio do texto da pagina", () => {
    const texto = "Detalhes do imovel. Condominio: R$ 850,00 por mes. IPTU: R$ 120,50.";
    expect(extrairValorMonetario(texto, /condom[ií]nio[^\d]{0,15}R\$\s*[\d.,]+/i)).toBe("R$ 850,00");
    expect(extrairValorMonetario(texto, /iptu[^\d]{0,15}R\$\s*[\d.,]+/i)).toBe("R$ 120,50");
  });

  it("retorna null quando o rotulo nao aparece", () => {
    expect(extrairValorMonetario("nada por aqui", /iptu[^\d]{0,15}R\$\s*[\d.,]+/i)).toBeNull();
  });
});
