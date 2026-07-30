import { describe, expect, it } from "vitest";
import { parseResultadosHtml } from "./webSearch.js";

// Fragmento reduzido, no formato real observado ao validar manualmente o
// endpoint html.duckduckgo.com/html/ em 2026-07-30 (ver plano apresentado ao
// usuario) - suficiente para testar o parser sem depender de rede em CI.
const HTML_FIXTURE = `
<div class="results">
  <div class="result results_links results_links_deep web-result ">
    <div class="result__body links_main links_deep">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.zapimoveis.com.br%2Fcondominio%2Fresidencial%2Dilha%2Dde%2Dsalina%2Fid%2D6bf6293e%2F&amp;rut=abc123">Residencial Ilha de Salina - ZAP Imóveis</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.zapimoveis.com.br%2Fcondominio%2Fresidencial%2Dilha%2Dde%2Dsalina%2Fid%2D6bf6293e%2F&amp;rut=abc123">Condomínio <b>Residencial Ilha de Salina</b>, Rua Duque de Caxias, 93, Boqueirão &amp; Praia Grande.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result ">
    <div class="result__body links_main links_deep">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.olx.com.br%2Fimoveis&amp;rut=def456">Apartamentos em Boqueirão - OLX</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.olx.com.br%2Fimoveis&amp;rut=def456">Milhares de anúncios de apartamentos.</a>
    </div>
  </div>
</div>
`;

describe("parseResultadosHtml", () => {
  it("extrai titulo, URL real (decodificada do redirect) e trecho de cada resultado", () => {
    const resultados = parseResultadosHtml(HTML_FIXTURE, "consulta de teste");

    expect(resultados).toHaveLength(2);
    expect(resultados[0].consulta).toBe("consulta de teste");
    expect(resultados[0].titulo).toBe("Residencial Ilha de Salina - ZAP Imóveis");
    expect(resultados[0].url).toBe("https://www.zapimoveis.com.br/condominio/residencial-ilha-de-salina/id-6bf6293e/");
    expect(resultados[0].trecho).toContain("Residencial Ilha de Salina");
    expect(resultados[0].trecho).toContain("Rua Duque de Caxias, 93");
  });

  it("decodifica entidades HTML (&amp; -> &) nos trechos", () => {
    const resultados = parseResultadosHtml(HTML_FIXTURE, "consulta de teste");
    expect(resultados[0].trecho).toContain("Boqueirão & Praia Grande");
  });

  it("retorna lista vazia para HTML sem resultados (0 matches, sem lancar excecao)", () => {
    expect(parseResultadosHtml("<html><body>sem resultados</body></html>", "q")).toEqual([]);
  });

  it("retorna lista vazia para HTML vazio ou malformado", () => {
    expect(parseResultadosHtml("", "q")).toEqual([]);
    expect(() => parseResultadosHtml("<<<not html", "q")).not.toThrow();
  });
});
