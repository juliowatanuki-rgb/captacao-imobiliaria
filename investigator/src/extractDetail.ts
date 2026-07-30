import type { Page } from "playwright";
import type { DetalheExtraido, FotoCandidata } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_FOTOS = 8;

// Palavras-chave usadas para priorizar fotos relevantes para localizacao
// (regra 7 do pedido: fachada, portaria, hall, recepcao, salao de festas,
// placas, letreiros, vista da sacada, pontos de referencia) - casadas contra
// o `alt` da imagem quando disponivel. A maioria dos sites nao descreve o
// conteudo de cada foto no alt, entao isso e so uma priorizacao best-effort,
// nao um filtro que descarta o resto.
const CATEGORIAS_PRIORITARIAS: { regex: RegExp; categoria: string }[] = [
  { regex: /fachada/i, categoria: "fachada" },
  { regex: /portaria/i, categoria: "portaria" },
  { regex: /\bhall\b/i, categoria: "hall" },
  { regex: /recep[cç][aã]o/i, categoria: "recepcao" },
  { regex: /sal[aã]o de festas/i, categoria: "salao_de_festas" },
  { regex: /placa/i, categoria: "placa" },
  { regex: /letreiro/i, categoria: "letreiro" },
  { regex: /sacada|varanda/i, categoria: "vista_sacada" },
  { regex: /vista/i, categoria: "vista" },
];

// URLs claramente irrelevantes (logos, icones, avatares de corretor, selos)
// que nao ajudam a localizar o imovel e so consumiriam cota de imagem/tokens.
const PADROES_IGNORAR = /logo|icon|favicon|avatar|selo|placeholder|sprite|banner-corretor/i;

export function classificarFoto(url: string, alt: string | null): FotoCandidata {
  const categoria = CATEGORIAS_PRIORITARIAS.find(
    (c) => c.regex.test(url) || (alt && c.regex.test(alt))
  );
  return { url, categoriaProvavel: categoria?.categoria ?? null };
}

export function ehUrlDeFotoValida(url: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (PADROES_IGNORAR.test(url)) return false;
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url) || /\/(photos|fotos|images|imagens)\//i.test(url);
}

/** Ordena priorizando categorias relevantes (regra 7) e limita ao maximo por requisicao. */
export function selecionarMelhoresFotos(candidatas: FotoCandidata[], max: number = MAX_FOTOS): FotoCandidata[] {
  const vistas = new Set<string>();
  const unicas = candidatas.filter((f) => {
    if (vistas.has(f.url)) return false;
    vistas.add(f.url);
    return true;
  });

  const prioritarias = unicas.filter((f) => f.categoriaProvavel !== null);
  const demais = unicas.filter((f) => f.categoriaProvavel === null);
  return [...prioritarias, ...demais].slice(0, max);
}

export function extrairValorMonetario(texto: string, rotulo: RegExp): string | null {
  const match = texto.match(rotulo);
  if (!match) return null;
  // Formato brasileiro: milhares com ponto, centavos com virgula opcional -
  // sem isso, "[\d.,]+" tambem engole o ponto final da frase (ex: "R$ 120,50.").
  const valorMatch = match[0].match(/R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/);
  return valorMatch ? valorMatch[0].trim() : null;
}

/**
 * Visita a pagina de detalhe do anuncio (Playwright) e extrai fotos +
 * condominio/IPTU em texto (best-effort, generico o suficiente para
 * funcionar em varias plataformas diferentes sem seletor dedicado por
 * site - esta e uma POC, nao um crawler por site como em crawlers/src/sites).
 * Nunca lanca excecao: qualquer falha vira `erro` no retorno, permitindo que
 * a investigacao continue so com os dados ja no banco (secao 18: isolamento
 * de falha por item).
 */
export async function extrairDetalhePagina(page: Page, url: string): Promise<DetalheExtraido> {
  try {
    await page.setExtraHTTPHeaders({ "User-Agent": USER_AGENT });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1_500); // galerias com lazy-load costumam levar um instante

    const raw = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img")).map((img) => ({
        src: img.currentSrc || img.src || img.getAttribute("data-src") || "",
        alt: img.getAttribute("alt"),
      }));
      const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        src: (a as HTMLAnchorElement).href,
        alt: a.getAttribute("aria-label") ?? a.getAttribute("title"),
      }));
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
      const texto = document.body.textContent ?? "";
      return { imgs, anchors, ogImage, texto };
    });

    const candidatas: FotoCandidata[] = [];
    for (const { src, alt } of [...raw.imgs, ...raw.anchors]) {
      if (ehUrlDeFotoValida(src)) candidatas.push(classificarFoto(src, alt));
    }
    if (raw.ogImage && ehUrlDeFotoValida(raw.ogImage)) {
      candidatas.push(classificarFoto(raw.ogImage, "fachada"));
    }

    const fotos = selecionarMelhoresFotos(candidatas);

    const condominioValorTexto = extrairValorMonetario(raw.texto, /condom[ií]nio[^\d]{0,15}R\$\s*[\d.,]+/i);
    const iptuValorTexto = extrairValorMonetario(raw.texto, /iptu[^\d]{0,15}R\$\s*[\d.,]+/i);

    return { condominioValorTexto, iptuValorTexto, fotos, erro: null };
  } catch (err) {
    return {
      condominioValorTexto: null,
      iptuValorTexto: null,
      fotos: [],
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}
