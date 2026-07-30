import { useState } from "react";
import { login, type AuthUser } from "./api.js";

export default function Login({
  onLogin,
  sessaoExpirada,
}: {
  onLogin: (token: string, user: AuthUser) => void;
  sessaoExpirada?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      onLogin(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Captacao Imobiliaria</h1>
        {sessaoExpirada && <p className="error">Sessao expirada. Faca login novamente.</p>}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
