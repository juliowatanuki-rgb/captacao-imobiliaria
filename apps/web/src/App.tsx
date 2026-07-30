import { useState } from "react";
import Login from "./Login.js";
import Dashboard from "./Dashboard.js";
import ListingsNew from "./ListingsNew.js";
import CrawlRuns from "./CrawlRuns.js";
import Users from "./Users.js";
import type { AuthUser } from "./api.js";

type Aba = "home" | "anuncios" | "logs" | "usuarios";

const STORAGE_KEY = "captacao_auth";

interface StoredAuth {
  token: string;
  user: AuthUser;
}

function loadStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export default function App() {
  const [auth, setAuth] = useState<StoredAuth | null>(loadStoredAuth);
  const [aba, setAba] = useState<Aba>("home");
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  function handleLogin(token: string, user: AuthUser) {
    const stored = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setAuth(stored);
    setSessaoExpirada(false);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }

  function handleSessionExpired() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    setSessaoExpirada(true);
  }

  if (!auth) {
    return <Login onLogin={handleLogin} sessaoExpirada={sessaoExpirada} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo">
            <span className="app-logo-mark">ESJW</span>
            <span className="app-logo-nome">Captacao Imobiliaria</span>
          </div>
          <nav className="app-tabs">
            <button
              type="button"
              className={aba === "home" ? "tab-active" : ""}
              onClick={() => setAba("home")}
            >
              Home
            </button>
            <button
              type="button"
              className={aba === "anuncios" ? "tab-active" : ""}
              onClick={() => setAba("anuncios")}
            >
              Anuncios novos
            </button>
            {auth.user.role === "admin" && (
              <button
                type="button"
                className={aba === "logs" ? "tab-active" : ""}
                onClick={() => setAba("logs")}
              >
                Logs de coleta
              </button>
            )}
            {auth.user.role === "admin" && (
              <button
                type="button"
                className={aba === "usuarios" ? "tab-active" : ""}
                onClick={() => setAba("usuarios")}
              >
                Usuarios
              </button>
            )}
          </nav>
        </div>
        <div className="user-info">
          <span>{auth.user.nome}</span>
          <button type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>
      <main>
        {aba === "home" && <Dashboard token={auth.token} onSessionExpired={handleSessionExpired} />}
        {aba === "anuncios" && <ListingsNew token={auth.token} onSessionExpired={handleSessionExpired} />}
        {aba === "logs" && auth.user.role === "admin" && (
          <CrawlRuns token={auth.token} onSessionExpired={handleSessionExpired} />
        )}
        {aba === "usuarios" && auth.user.role === "admin" && (
          <Users token={auth.token} onSessionExpired={handleSessionExpired} />
        )}
      </main>
    </div>
  );
}
