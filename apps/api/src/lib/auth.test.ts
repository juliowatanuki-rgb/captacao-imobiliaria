import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.js";

beforeAll(() => {
  process.env.JWT_SECRET = "segredo-de-teste-nao-usar-em-producao";
});

describe("hashPassword / verifyPassword", () => {
  it("gera um hash que valida com a senha original", async () => {
    const hash = await hashPassword("minha-senha-123");
    expect(await verifyPassword("minha-senha-123", hash)).toBe(true);
  });

  it("rejeita uma senha incorreta", async () => {
    const hash = await hashPassword("minha-senha-123");
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });
});

describe("signToken / verifyToken", () => {
  it("gera um token que pode ser verificado e contem o payload original", () => {
    const payload = { sub: "user-1", email: "a@b.com", nome: "Fulano", role: "admin" as const };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe("admin");
  });

  it("lanca erro para um token invalido", () => {
    expect(() => verifyToken("token-invalido")).toThrow();
  });
});
