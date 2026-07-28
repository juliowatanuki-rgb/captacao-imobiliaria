import { createHash } from "node:crypto";

// Parametros de rastreamento removidos sempre (secao 10).
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_EXACT = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "_ga",
]);

// Parametros que identificam o imovel e devem ser preservados (secao 10).
const DEFAULT_IDENTIFYING_PARAMS = ["id", "codigo", "cod", "imovel", "listing", "property"];

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  if (TRACKING_PARAM_EXACT.has(lower)) return true;
  return TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export interface NormalizeUrlOptions {
  /** Parametros adicionais especificos do site que tambem devem ser preservados. */
  extraIdentifyingParams?: string[];
}

export interface NormalizedUrl {
  urlAbsoluta: string;
  urlNormalizada: string;
  urlHash: string;
}

/**
 * Normaliza uma URL de anuncio conforme secao 10 da especificacao:
 * - vira absoluta a partir de urlBase quando for relativa
 * - dominio em minusculas
 * - remove barra final desnecessaria
 * - remove fragmento (#...)
 * - mantem apenas parametros identificadores do imovel, ordenados
 */
export function normalizeUrl(
  rawUrl: string,
  urlBase: string,
  options: NormalizeUrlOptions = {}
): NormalizedUrl {
  const absolute = new URL(rawUrl, urlBase);
  absolute.hash = "";
  absolute.hostname = absolute.hostname.toLowerCase();

  const identifyingParams = new Set(
    [...DEFAULT_IDENTIFYING_PARAMS, ...(options.extraIdentifyingParams ?? [])].map((p) =>
      p.toLowerCase()
    )
  );

  const keptParams: [string, string][] = [];
  for (const [key, value] of absolute.searchParams.entries()) {
    if (isTrackingParam(key)) continue;
    if (identifyingParams.has(key.toLowerCase())) {
      keptParams.push([key, value]);
    }
  }
  keptParams.sort(([a], [b]) => a.localeCompare(b));

  const search = new URLSearchParams();
  for (const [key, value] of keptParams) {
    search.append(key, value);
  }

  let pathname = absolute.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const searchString = search.toString();
  const urlNormalizada = `${absolute.protocol}//${absolute.hostname}${pathname}${
    searchString ? `?${searchString}` : ""
  }`;

  const urlHash = createHash("sha256").update(urlNormalizada).digest("hex");

  return {
    urlAbsoluta: absolute.toString(),
    urlNormalizada,
    urlHash,
  };
}
