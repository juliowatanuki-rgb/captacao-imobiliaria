// Motor generico para imobiliarias que usam a plataforma Imobzi
// (identificada pelo Angular custom-element <imobzi-property-card> /
// <imobzi-grid-card>, pelas imagens hospedadas em
// imobzi.storage.googleapis.com / firebasestorage.app (bucket
// "imobzi-app-production") e pela API auxiliar api2.imobzi.app).
//
// Estrutura de card validada manualmente em housefort.com.br em 2026-07-28
// (SPA Angular com SSR - o HTML ja vem com os cards renderizados, sem
// necessidade de esperar chamadas XHR):
// <imobzi-property-card>
//   <mat-card>
//     ...
//     <a href="/imovel/{slug}-code-{codigo}">{imagens}</a>   (link dentro da galeria)
//     <h3 class="h3 color-title property-title" title="{Tipo} em {Bairro} - {Cidade}, {UF}">...</h3>
//     <h3 class="h2 color-title"> R$ {preco} <span class="small">/venda</span></h3>
//     <h3 class="h3 color-title neighborhood-title">Cod: {codigo}</h3>
//     <div class="icons">
//       <p title="Dormitorios">{n}</p>
//       <p title="Banheiros">{n}</p>
//       <p title="Suites">{n}</p>
//       <p title="Vagas">{n}</p>
//       <p title="useful_area">{area} m2</p>
//     </div>
//   </mat-card>
// </imobzi-property-card>
// A paginacao e feita via query string `&page=N` (SSR, navegavel direto por URL).
//
// Validado tambem ao vivo em 2026-07-29 contra alinecaetano.com.br, que roda
// uma versao mais nova do template Imobzi com o custom-element
// <imobzi-grid-card> (em vez de <imobzi-property-card>). Diferencas dessa
// versao, ja tratadas abaixo:
// - .property-title (title attr e texto) agora e um titulo de marketing
//   livre (ex.: "Oportunidade - Apto 2 dorms c/ sacada por 335 mil"), NAO
//   mais "{Tipo} em {Bairro} - {Cidade}, {UF}" - nao da mais pra extrair
//   bairro dai.
// - .neighborhood-title passou a vir como "{Bairro} - Cód. {codigo}" (com
//   bairro incluido), em vez de so "Cod: {codigo}" (so numerico). O codigo
//   tambem passou a ser alfanumerico (ex.: "ACTA9108", "JGA70"), nao mais so
//   digitos.
// extractCodigo/extractBairro abaixo tentam primeiro o formato novo
// (.neighborhood-title "{Bairro} - Cód. {codigo}") e caem para o formato
// antigo (title attr "{Tipo} em {Bairro} - ...", codigo so numerico) quando
// o primeiro nao casar - cobre os dois sites sem duplicar o motor.
//
// IMPORTANTE (secao 18): a busca `/buscar` deste site parece ser compartilhada
// por uma rede/franquia - ela retorna imoveis de VARIAS cidades do Brasil
// (nao so da cidade da imobiliaria), sem uma URL dedicada so para Praia
// Grande. O titulo do card normalmente termina em "- {Cidade}, {UF}", mas
// tem variacoes sujas (sem UF, com texto extra tipo "por 549000" colado).
// Por isso o filtro definitivo de cidade usa o href do imovel (que sempre
// contem o slug "-praia-grande-" quando o imovel e de Praia Grande) e nao o
// texto do titulo - imoveis sem esse slug no href sao descartados aqui
// mesmo (nao sao devolvidos pelo crawler). Alguns sites (ex.: Aline Caetano)
// tem um parametro `&city=Praia%20Grande` na propria busca que ja filtra do
// lado do servidor - mesmo assim o filtro por href e mantido aqui como
// segunda camada de seguranca.

import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { SiteCrawlerModule } from "../siteRegistry.js";

const MAX_PAGINAS_PADRAO = 150;
const PAUSA_ENTRE_PAGINAS_MS = 800;
const MAX_TENTATIVAS_PAGINA_VAZIA = 3;

interface RawCard {
  href: string;
  codigoTexto: string | null;
  tituloAttr: string | null;
  precoTexto: string;
  icones: { titulo: string | null; texto: string }[];
}

// Nota: esta funcao roda serializada dentro da pagina via page.evaluate.
// Evitar declarar funcoes nomeadas aqui dentro - o transform do tsx/esbuild
// injeta chamadas a um helper "__name" que nao existe no contexto da pagina
// (erro "__name is not defined"), ver aviso em platforms/imoview.ts.
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("imobzi-property-card, imobzi-grid-card"));
    return cards.map((card) => {
      const href = card.querySelector<HTMLAnchorElement>('a[href^="/imovel/"]')?.href ?? "";
      const codigoTexto = card.querySelector(".neighborhood-title")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const tituloEl = card.querySelector(".property-title");
      const tituloAttr = tituloEl?.getAttribute("title") ?? tituloEl?.textContent?.trim() ?? null;
      const precoEl = Array.from(card.querySelectorAll("h3.color-title")).find((el) =>
        (el.textContent ?? "").includes("R$")
      );
      const precoTexto = precoEl?.childNodes[0]?.textContent?.trim() ?? "";
      const icones = Array.from(card.querySelectorAll(".icons p")).map((el) => ({
        titulo: el.getAttribute("title"),
        texto: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
      }));
      return { href, codigoTexto, tituloAttr, precoTexto, icones };
    });
  });
}

function parseMoeda(texto: string): number | null {
  const numeros = texto.replace(/[^\d,]/g, "").replace(",", ".");
  const valor = Number.parseFloat(numeros);
  return Number.isFinite(valor) ? valor : null;
}

// Remove acentos para comparar titulos de icone (o site usa "Dormitórios",
// "Suítes" etc. com acentuacao, mas nao vale a pena depender disso).
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function parseIconeNumero(icones: RawCard["icones"], tituloIcone: string): number | null {
  const alvo = normalizar(tituloIcone);
  const item = icones.find((i) => i.titulo && normalizar(i.titulo) === alvo);
  if (!item) return null;
  const match = item.texto.match(/([\d.,]+)/);
  if (!match) return null;
  const valor = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

// Formato do .neighborhood-title, que cobre os dois templates observados:
// - novo (grid-card): "{Bairro} - Cód. {codigo}" (codigo alfanumerico, ex.: ACTA9108)
// - antigo (property-card): "Cod: {codigo}" (so digitos, sem bairro)
const NEIGHBORHOOD_TITLE_REGEX = /^(?:(.+?)\s*-\s*)?C[oó]d\.?:?\s*([A-Za-z0-9]+)\s*$/i;

function parseNeighborhoodTitle(codigoTexto: string | null): { bairro: string | null; codigo: string | null } {
  if (!codigoTexto) return { bairro: null, codigo: null };
  const match = codigoTexto.match(NEIGHBORHOOD_TITLE_REGEX);
  if (!match) return { bairro: null, codigo: null };
  return { bairro: match[1]?.trim() || null, codigo: match[2] || null };
}

function extractCodigo(codigoTexto: string | null, href: string): string | null {
  const { codigo } = parseNeighborhoodTitle(codigoTexto);
  if (codigo) return codigo;
  const matchHref = href.match(/-code-([A-Za-z0-9]+)/i);
  return matchHref ? matchHref[1] : null;
}

// Bairro: tenta primeiro o .neighborhood-title (template novo, "{Bairro} - Cód. X"),
// e cai para o title attr do .property-title (template antigo, "{Tipo} em
// {Bairro} - {Cidade}, {UF}") quando o primeiro nao tiver bairro (ex.:
// template antigo so tem "Cod: X" ali, ou o titulo de marketing do template
// novo nao segue o padrao "em Bairro").
function extractBairro(codigoTexto: string | null, tituloAttr: string | null): string | null {
  const { bairro } = parseNeighborhoodTitle(codigoTexto);
  if (bairro) return bairro;
  if (!tituloAttr) return null;
  const match = tituloAttr.match(/\bem\s+(.+?)\s*[-–]\s*.+$/i);
  return match ? match[1].trim() : null;
}

function isPraiaGrande(href: string): boolean {
  return /-praia-grande(-|$)/i.test(href);
}

export interface ImobziConfig {
  urlListagem: string;
  maxPaginas?: number;
}

export function createImobziCrawler(config: ImobziConfig): SiteCrawlerModule {
  return {
    async scrape({ page }) {
      const listings: ScrapedListing[] = [];
      const maxPaginas = config.maxPaginas ?? MAX_PAGINAS_PADRAO;
      let paginasVisitadas = 0;

      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const separador = config.urlListagem.includes("?") ? "&" : "?";
        const url = pagina === 1 ? config.urlListagem : `${config.urlListagem}${separador}page=${pagina}`;

        let cards: RawCard[] = [];
        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_PAGINA_VAZIA; tentativa++) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForSelector("imobzi-property-card, imobzi-grid-card", { timeout: 15_000 }).catch(() => {});
          // O primeiro paint pode ser o HTML de SSR ainda nao hidratado pelo
          // Angular (nos sites com o template <imobzi-grid-card> o SSR chega
          // a servir temporariamente o custom-element antigo
          // <imobzi-property-card> sem href/bairro preenchidos, ate a
          // hidratacao no cliente trocar pelo conteudo final) - uma pequena
          // espera aqui evita capturar esse estado transitorio incompleto.
          await page.waitForTimeout(1_000);
          cards = await extractCards(page);
          if (cards.length > 0 && cards.every((c) => c.href)) {
            // O href pode ja estar preenchido enquanto o codigo do
            // .neighborhood-title ainda muda (ex.: ganha um sufixo de letra)
            // nos instantes seguintes da hidratacao - confirma que os codigos
            // nao mudam mais antes de aceitar a pagina, pra nao gravar um
            // codigo transitorio como identidade do anuncio (secao 9) e
            // duplicar o anuncio na proxima coleta com o codigo final.
            await page.waitForTimeout(800);
            const cardsConfirmacao = await extractCards(page);
            const codigosIniciais = cards.map((c) => extractCodigo(c.codigoTexto, c.href));
            const codigosConfirmacao = cardsConfirmacao.map((c) => extractCodigo(c.codigoTexto, c.href));
            const estavel =
              codigosIniciais.length === codigosConfirmacao.length &&
              codigosIniciais.every((codigo, i) => codigo === codigosConfirmacao[i]);
            if (estavel) break;
            cards = cardsConfirmacao;
          }
          if (tentativa < MAX_TENTATIVAS_PAGINA_VAZIA) {
            await page.waitForTimeout(1_000 * tentativa);
          }
        }

        paginasVisitadas += 1;
        if (cards.length === 0) break;

        for (const card of cards) {
          if (!card.href) continue;
          if (!isPraiaGrande(card.href)) continue; // fora do escopo (rede nacional)

          listings.push({
            externalId: extractCodigo(card.codigoTexto, card.href),
            urlOriginal: card.href,
            titulo: card.tituloAttr,
            tipoImovel: card.tituloAttr,
            cidade: "Praia Grande",
            bairro: extractBairro(card.codigoTexto, card.tituloAttr),
            preco: parseMoeda(card.precoTexto),
            areaUtil: parseIconeNumero(card.icones, "useful_area"),
            dormitorios: parseIconeNumero(card.icones, "Dormitorios"),
            suites: parseIconeNumero(card.icones, "Suites"),
            banheiros: parseIconeNumero(card.icones, "Banheiros"),
            vagas: parseIconeNumero(card.icones, "Vagas"),
          });
        }

        await page.waitForTimeout(PAUSA_ENTRE_PAGINAS_MS);
      }

      return { listings, paginasVisitadas };
    },
  };
}
