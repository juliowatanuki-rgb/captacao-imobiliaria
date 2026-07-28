import type { Page } from "playwright";
import type { ScrapedListing } from "@captacao/shared";
import type { NormalizeUrlOptions } from "@captacao/crawler-core";

export interface SiteScrapeContext {
  page: Page;
  urlBase: string;
  urlListagem: string;
}

export interface SiteScrapeOutput {
  listings: ScrapedListing[];
  paginasVisitadas: number;
}

export interface SiteCrawlerModule {
  /** Parametros de URL especificos do site (secao 10), alem dos padroes id/codigo/cod/imovel/listing/property. */
  urlOptions?: NormalizeUrlOptions;
  scrape(ctx: SiteScrapeContext): Promise<SiteScrapeOutput>;
}

/**
 * Carrega o modulo de crawler especifico de um site pelo seu id (secao 18: cada
 * imobiliaria tem seu proprio crawler ou configuracao dentro do crawler modelo).
 * Lanca erro se o modulo nao existir - o chamador (runCrawler/crawlSite) trata
 * isso como falha isolada daquele site, sem impedir os demais.
 */
export async function loadSiteModule(siteId: string): Promise<SiteCrawlerModule> {
  const mod = (await import(`./sites/${siteId}.js`)) as { default: SiteCrawlerModule };
  if (!mod.default) {
    throw new Error(`crawler do site "${siteId}" nao exporta um default export valido`);
  }
  return mod.default;
}
