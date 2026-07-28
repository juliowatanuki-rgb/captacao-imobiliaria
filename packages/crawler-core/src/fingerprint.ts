import { createHash } from "node:crypto";
import type { ScrapedListing } from "@captacao/shared";

const MIN_STABLE_FIELDS = 3;
const DIACRITICS_REGEX = /[̀-ͯ]/g;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Gera uma assinatura (fingerprint) a partir de campos estaveis do anuncio,
 * usada apenas como ultimo recurso quando nao ha codigo oficial nem URL confiavel (secao 9.3).
 * Retorna null quando os dados disponiveis sao fracos demais para uma fingerprint minimamente confiavel -
 * nesse caso o chamador deve criar o registro como novo e marcar identidade como fraca,
 * pois e melhor aceitar uma duplicidade eventual do que perder um anuncio novo real.
 */
export function buildFingerprint(scraped: ScrapedListing): string | null {
  const fields = [
    normalizeText(scraped.tipoImovel),
    normalizeText(scraped.bairro),
    normalizeText(scraped.titulo),
    scraped.areaUtil != null ? String(scraped.areaUtil) : "",
    scraped.dormitorios != null ? String(scraped.dormitorios) : "",
    scraped.suites != null ? String(scraped.suites) : "",
    scraped.vagas != null ? String(scraped.vagas) : "",
    scraped.preco != null ? String(scraped.preco) : "",
  ];

  const filled = fields.filter((f) => f !== "").length;
  if (filled < MIN_STABLE_FIELDS) {
    return null;
  }

  return createHash("sha256").update(fields.join("|")).digest("hex");
}
