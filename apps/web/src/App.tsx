import { lazy, Suspense, useState } from "react";
import Login from "./Login.js";
import type { AuthUser } from "./api.js";

// Cada aba vira seu proprio chunk JS, baixado so quando o usuario visita ela
// pela 1a vez (auditoria de performance de 2026-08-01 - antes tudo ia num so
// bundle carregado de cara, incluindo telas admin que a maioria nunca abre).
const Dashboard = lazy(() => import("./Dashboard.js"));
const ListingsNew = lazy(() => import("./ListingsNew.js"));
const CrawlRuns = lazy(() => import("./CrawlRuns.js"));
const Users = lazy(() => import("./Users.js"));

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
  // Uma aba, uma vez visitada, fica montada (so escondida via CSS) daqui pra
  // frente - evita refazer o fetch (e a query pesada por tras) toda vez que
  // o usuario volta pra uma aba que ja tinha carregado (auditoria de
  // performance de 2026-08-01 - a navegacao entre abas estava pesada porque
  // cada troca desmontava e remontava o componente do zero).
  const [visitadas, setVisitadas] = useState<Set<Aba>>(() => new Set(["home"]));
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  function irPara(nova: Aba) {
    setAba(nova);
    setVisitadas((prev) => (prev.has(nova) ? prev : new Set(prev).add(nova)));
  }

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
              onClick={() => irPara("home")}
            >
              Home
            </button>
            <button
              type="button"
              className={aba === "anuncios" ? "tab-active" : ""}
              onClick={() => irPara("anuncios")}
            >
              Anuncios novos
            </button>
            {auth.user.role === "admin" && (
              <button
                type="button"
                className={aba === "logs" ? "tab-active" : ""}
                onClick={() => irPara("logs")}
              >
                Logs de coleta
              </button>
            )}
            {auth.user.role === "admin" && (
              <button
                type="button"
                className={aba === "usuarios" ? "tab-active" : ""}
                onClick={() => irPara("usuarios")}
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
        {visitadas.has("home") && (
          <div style={{ display: aba === "home" ? "contents" : "none" }}>
            <Suspense fallback={<p className="status-msg">Carregando...</p>}>
              <Dashboard token={auth.token} onSessionExpired={handleSessionExpired} />
            </Suspense>
          </div>
        )}
        {visitadas.has("anuncios") && (
          <div style={{ display: aba === "anuncios" ? "contents" : "none" }}>
            <Suspense fallback={<p className="status-msg">Carregando...</p>}>
              <ListingsNew token={auth.token} onSessionExpired={handleSessionExpired} />
            </Suspense>
          </div>
        )}
        {visitadas.has("logs") && auth.user.role === "admin" && (
          <div style={{ display: aba === "logs" ? "contents" : "none" }}>
            <Suspense fallback={<p className="status-msg">Carregando...</p>}>
              <CrawlRuns token={auth.token} onSessionExpired={handleSessionExpired} />
            </Suspense>
          </div>
        )}
        {visitadas.has("usuarios") && auth.user.role === "admin" && (
          <div style={{ display: aba === "usuarios" ? "contents" : "none" }}>
            <Suspense fallback={<p className="status-msg">Carregando...</p>}>
              <Users token={auth.token} onSessionExpired={handleSessionExpired} />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}
