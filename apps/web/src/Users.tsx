import { useEffect, useState } from "react";
import { createUser, fetchUsers, updateUser, type ManagedUser } from "./api.js";

interface NovoUsuarioForm {
  nome: string;
  email: string;
  telefone: string;
  role: "admin" | "corretora";
  senha: string;
}

const FORM_VAZIO: NovoUsuarioForm = { nome: "", email: "", telefone: "", role: "corretora", senha: "" };

interface EditDraft {
  nome: string;
  email: string;
  telefone: string;
  role: "admin" | "corretora";
  ativo: boolean;
  senha: string;
}

function draftFromUser(user: ManagedUser): EditDraft {
  return {
    nome: user.nome,
    email: user.email,
    telefone: user.telefone ?? "",
    role: user.role,
    ativo: user.ativo,
    senha: "",
  };
}

export default function Users({ token }: { token: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [novo, setNovo] = useState<NovoUsuarioForm>(FORM_VAZIO);
  const [criando, setCriando] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { users } = await fetchUsers(token);
      setUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao carregar usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    setErroNovo(null);
    setCriando(true);
    try {
      const { user } = await createUser(token, novo);
      setUsers((prev) => [...prev, user].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovo(FORM_VAZIO);
    } catch (err) {
      setErroNovo(err instanceof Error ? err.message : "erro ao criar usuario");
    } finally {
      setCriando(false);
    }
  }

  function iniciarEdicao(user: ManagedUser) {
    setEditandoId(user.id);
    setDrafts((prev) => ({ ...prev, [user.id]: draftFromUser(user) }));
    setErroEdicao(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setErroEdicao(null);
  }

  function updateDraft(id: string, field: keyof EditDraft, value: string | boolean) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function salvarEdicao(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setErroEdicao(null);
    setSalvandoId(id);
    try {
      const payload: Partial<{
        nome: string;
        email: string;
        telefone: string;
        role: "admin" | "corretora";
        ativo: boolean;
        senha: string;
      }> = {
        nome: draft.nome,
        email: draft.email,
        telefone: draft.telefone,
        role: draft.role,
        ativo: draft.ativo,
      };
      if (draft.senha.trim().length > 0) {
        payload.senha = draft.senha.trim();
      }
      const { user } = await updateUser(token, id, payload);
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
      setEditandoId(null);
    } catch (err) {
      setErroEdicao(err instanceof Error ? err.message : "erro ao salvar usuario");
    } finally {
      setSalvandoId(null);
    }
  }

  if (loading) return <p className="status-msg">Carregando usuarios...</p>;
  if (error) return <p className="status-msg error">{error}</p>;

  return (
    <div className="users-page">
      <form className="novo-usuario-form" onSubmit={handleCriar}>
        <h2>Novo usuario</h2>
        <label>
          Nome
          <input
            value={novo.nome}
            onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
            required
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={novo.email}
            onChange={(e) => setNovo({ ...novo, email: e.target.value })}
            required
          />
        </label>
        <label>
          Telefone
          <input
            value={novo.telefone}
            onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
          />
        </label>
        <label>
          Perfil
          <select
            value={novo.role}
            onChange={(e) => setNovo({ ...novo, role: e.target.value as "admin" | "corretora" })}
          >
            <option value="corretora">Corretora</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          Senha
          <input
            type="password"
            value={novo.senha}
            onChange={(e) => setNovo({ ...novo, senha: e.target.value })}
            minLength={6}
            required
          />
        </label>
        {erroNovo && <p className="error">{erroNovo}</p>}
        <button type="submit" className="primary" disabled={criando}>
          {criando ? "Criando..." : "Criar usuario"}
        </button>
      </form>

      <table className="users-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Telefone</th>
            <th>Perfil</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const editando = editandoId === user.id;
            const draft = drafts[user.id];
            return (
              <tr key={user.id}>
                {editando && draft ? (
                  <>
                    <td>
                      <input value={draft.nome} onChange={(e) => updateDraft(user.id, "nome", e.target.value)} />
                    </td>
                    <td>
                      <input
                        type="email"
                        value={draft.email}
                        onChange={(e) => updateDraft(user.id, "email", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        value={draft.telefone}
                        onChange={(e) => updateDraft(user.id, "telefone", e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={draft.role}
                        onChange={(e) => updateDraft(user.id, "role", e.target.value)}
                      >
                        <option value="corretora">Corretora</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <label className="ativo-toggle">
                        <input
                          type="checkbox"
                          checked={draft.ativo}
                          onChange={(e) => updateDraft(user.id, "ativo", e.target.checked)}
                        />
                        {draft.ativo ? "Ativo" : "Inativo"}
                      </label>
                    </td>
                    <td className="edicao-acoes">
                      <input
                        type="password"
                        placeholder="Nova senha (opcional)"
                        value={draft.senha}
                        onChange={(e) => updateDraft(user.id, "senha", e.target.value)}
                        minLength={6}
                      />
                      <button type="button" className="primary" disabled={salvandoId === user.id} onClick={() => salvarEdicao(user.id)}>
                        {salvandoId === user.id ? "Salvando..." : "Salvar"}
                      </button>
                      <button type="button" onClick={cancelarEdicao}>
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{user.nome}</td>
                    <td>{user.email}</td>
                    <td>{user.telefone ?? "-"}</td>
                    <td>{user.role === "admin" ? "Admin" : "Corretora"}</td>
                    <td>
                      <span className={`status-badge ${user.ativo ? "status-sucesso" : "status-erro"}`}>
                        {user.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <button type="button" onClick={() => iniciarEdicao(user)}>
                        Editar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {erroEdicao && <p className="error">{erroEdicao}</p>}
    </div>
  );
}
