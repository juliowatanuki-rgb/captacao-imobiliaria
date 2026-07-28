import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNewListings, login, setListingStatus } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("login envia email/senha e retorna token + usuario", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "abc123", user: { id: "1", email: "a@b.com", nome: "A", role: "admin" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await login("a@b.com", "senha");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.token).toBe("abc123");
  });

  it("inclui o header Authorization quando um token e informado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ listings: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchNewListings("meu-token");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer meu-token");
  });

  it("lanca um erro com a mensagem da API quando a resposta nao e ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "token invalido ou expirado" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(setListingStatus("token", "id-1", "analisado")).rejects.toThrow(
      "token invalido ou expirado"
    );
  });
});
