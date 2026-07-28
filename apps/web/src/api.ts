const API_URL = import.meta.env.VITE_API_URL;

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: "admin" | "corretora";
}

export interface NewListing {
  id: string;
  titulo: string | null;
  bairro: string | null;
  preco: string | null;
  url_original: string;
  url_final: string | null;
  tipo_imovel: string | null;
  condominio_nome: string | null;
  endereco: string | null;
  primeira_captura_em: string;
  analysis_status: string;
  site_id: string;
  site_nome: string;
}

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `erro ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return request<{ token: string; user: AuthUser }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchNewListings(token: string) {
  return request<{ listings: NewListing[] }>("/api/listings/new", token);
}

export function setListingStatus(
  token: string,
  listingId: string,
  status: "analisado" | "descartado" | "selecionado_para_captacao"
) {
  return request<{ ok: true }>(`/api/listings/${listingId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function setListingNotes(
  token: string,
  listingId: string,
  notes: {
    observacoes?: string;
    condominioIdentificadoManual?: string;
    enderecoIdentificadoManual?: string;
  }
) {
  return request<{ ok: true }>(`/api/listings/${listingId}/notes`, token, {
    method: "PATCH",
    body: JSON.stringify(notes),
  });
}
