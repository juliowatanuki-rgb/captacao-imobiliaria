import { describe, expect, it } from "vitest";
import { resolveIdentity } from "./identity.js";
import type { ScrapedListing } from "@captacao/shared";

const urlBase = "https://www.exemplo.com.br";

function scraped(overrides: Partial<ScrapedListing> = {}): ScrapedListing {
  return {
    urlOriginal: "https://www.exemplo.com.br/imovel/1",
    ...overrides,
  };
}

describe("resolveIdentity", () => {
  it("usa o codigo oficial (external) quando presente, com confianca forte", () => {
    const identity = resolveIdentity(scraped({ externalId: "4312" }), urlBase);
    expect(identity.identityType).toBe("external");
    expect(identity.identityKey).toBe("external:4312");
    expect(identity.identityConfidence).toBe("forte");
  });

  it("cai para url_hash quando nao ha codigo oficial", () => {
    const identity = resolveIdentity(scraped(), urlBase);
    expect(identity.identityType).toBe("url_hash");
    expect(identity.identityConfidence).toBe("forte");
    expect(identity.identityKey).toMatch(/^url_hash:/);
  });

  it("ignora externalId vazio/so espacos e cai para url_hash", () => {
    const identity = resolveIdentity(scraped({ externalId: "   " }), urlBase);
    expect(identity.identityType).toBe("url_hash");
  });

  it("gera a mesma identity_key para o mesmo codigo oficial em capturas diferentes", () => {
    const first = resolveIdentity(scraped({ externalId: "4312", titulo: "Antigo" }), urlBase);
    const second = resolveIdentity(scraped({ externalId: "4312", titulo: "Novo titulo" }), urlBase);
    expect(first.identityKey).toBe(second.identityKey);
  });

  it("cai para fingerprint (identidade fraca) quando a url e invalida e nao ha codigo", () => {
    const identity = resolveIdentity(
      scraped({
        urlOriginal: "/imovel/1",
        tipoImovel: "Apartamento",
        bairro: "Canto do Forte",
        titulo: "Apartamento a venda no Canto do Forte",
        areaUtil: 70,
      }),
      "isso-nao-e-uma-url-base-valida"
    );
    expect(identity.identityType).toBe("fingerprint");
    expect(identity.identityConfidence).toBe("fraca");
  });
});
