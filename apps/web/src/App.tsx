import { useState } from "react";
import Login from "./Login.js";
import ListingsNew from "./ListingsNew.js";
import type { AuthUser } from "./api.js";

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

  function handleLogin(token: string, user: AuthUser) {
    const stored = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setAuth(stored);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }

  if (!auth) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Anuncios novos</h1>
        <div className="user-info">
          <span>{auth.user.nome}</span>
          <button type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>
      <main>
        <ListingsNew token={auth.token} />
      </main>
    </div>
  );
}
