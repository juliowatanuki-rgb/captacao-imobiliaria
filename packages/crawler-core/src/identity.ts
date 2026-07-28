import type { IdentityType, ScrapedListing } from "@captacao/shared";
import { buildFingerprint } from "./fingerprint.js";
import { normalizeUrl, type NormalizeUrlOptions } from "./urlNormalize.js";

export interface ResolvedIdentity {
  identityType: IdentityType;
  identityKey: string;
  identityConfidence: "forte" | "fraca";
  urlNormalizada: string | null;
  urlHash: string | null;
  fingerprint: string | null;
}

/**
 * Resolve a identidade de um anuncio dentro de uma imobiliaria (secao 9):
 * 1. codigo oficial, quando existir
 * 2. url normalizada, quando nao houver codigo
 * 3. fingerprint, apenas como ultimo recurso
 * Se nem fingerprint for confiavel, ainda assim retorna uma chave (baseada na url bruta)
 * marcada como "fraca" - e melhor aceitar duplicidade eventual do que perder um anuncio novo real.
 */
export function resolveIdentity(
  scraped: ScrapedListing,
  urlBase: string,
  urlOptions: NormalizeUrlOptions = {}
): ResolvedIdentity {
  if (scraped.externalId) {
    const trimmed = scraped.externalId.trim();
    if (trimmed.length > 0) {
      let urlNormalizada: string | null = null;
      let urlHash: string | null = null;
      try {
        const normalized = normalizeUrl(scraped.urlFinal ?? scraped.urlOriginal, urlBase, urlOptions);
        urlNormalizada = normalized.urlNormalizada;
        urlHash = normalized.urlHash;
      } catch {
        // URL invalida nao impede usar o codigo oficial como identidade.
      }
      return {
        identityType: "external",
        identityKey: `external:${trimmed}`,
        identityConfidence: "forte",
        urlNormalizada,
        urlHash,
        fingerprint: null,
      };
    }
  }

  try {
    const { urlNormalizada, urlHash } = normalizeUrl(
      scraped.urlFinal ?? scraped.urlOriginal,
      urlBase,
      urlOptions
    );
    return {
      identityType: "url_hash",
      identityKey: `url_hash:${urlHash}`,
      identityConfidence: "forte",
      urlNormalizada,
      urlHash,
      fingerprint: null,
    };
  } catch {
    // URL nao pode ser normalizada - cai para fingerprint.
  }

  const fingerprint = buildFingerprint(scraped);
  if (fingerprint) {
    return {
      identityType: "fingerprint",
      identityKey: `fingerprint:${fingerprint}`,
      identityConfidence: "fraca",
      urlNormalizada: null,
      urlHash: null,
      fingerprint,
    };
  }

  // Ultimo recurso: nem codigo, nem url valida, nem fingerprint confiavel.
  // Usa a url bruta como chave e marca como identidade fraca, para nunca perder um anuncio novo.
  return {
    identityType: "fingerprint",
    identityKey: `fingerprint:raw:${scraped.urlOriginal}`,
    identityConfidence: "fraca",
    urlNormalizada: null,
    urlHash: null,
    fingerprint: null,
  };
}
