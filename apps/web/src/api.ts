const API_URL = import.meta.env.VITE_API_URL;

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: "admin" | "corretora";
}

export interface CrawlRunSummary {
  id: string;
  inicio_em: string;
  fim_em: string | null;
  status: string;
  sites_previstos: number;
  sites_sucesso: number;
  sites_alerta: number;
  sites_erro: number;
  total_anuncios_encontrados: number;
  total_anuncios_novos: number;
  total_anuncios_atualizados: number;
}

export interface SiteCrawlRun {
  id: string;
  site_id: string;
  site_nome: string;
  inicio_em: string;
  fim_em: string | null;
  status: string;
  paginas_visitadas: number;
  anuncios_encontrados: number;
  anuncios_novos: number;
  anuncios_existentes: number;
  anuncios_atualizados: number;
  anuncios_sem_alteracao: number;
  anuncios_ausentes: number;
  anuncios_duplicados_coleta: number;
  duracao_segundos: number | null;
  mensagem_erro: string | null;
  detalhe_tecnico: string | null;
}

export interface ManagedUser {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  role: "admin" | "corretora";
  ativo: boolean;
  criado_em: string;
}

export interface UltimaSincronizacao {
  id: string;
  inicio_em: string;
  fim_em: string | null;
  status: string;
}

export interface DashboardSite {
  site_id: string;
  site_nome: string;
  status: string | null;
  fim_em: string | null;
  mensagem_erro: string | null;
}

export interface CaptacaoPorDia {
  dia: string;
  total: number;
}

export interface RankingSite {
  site_nome: string;
  total: number;
}

export interface DashboardData {
  ultimaSincronizacao: UltimaSincronizacao | null;
  sites: DashboardSite[];
  captacaoPorDia: CaptacaoPorDia[];
  ranking: RankingSite[];
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
  condominio_identificado_manual: string | null;
  endereco_identificado_manual: string | null;
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

export function fetchCrawlRuns(token: string) {
  return request<{ crawlRuns: CrawlRunSummary[] }>("/api/crawl-runs", token);
}

export function fetchDashboard(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return request<DashboardData>(`/api/dashboard${query ? `?${query}` : ""}`, token);
}

export function fetchCrawlRunDetail(token: string, id: string) {
  return request<{ crawlRun: CrawlRunSummary; siteRuns: SiteCrawlRun[] }>(
    `/api/crawl-runs/${id}`,
    token
  );
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

export function fetchUsers(token: string) {
  return request<{ users: ManagedUser[] }>("/api/users", token);
}

export function createUser(
  token: string,
  data: { nome: string; email: string; telefone: string; role: "admin" | "corretora"; senha: string }
) {
  return request<{ user: ManagedUser }>("/api/users", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateUser(
  token: string,
  id: string,
  data: Partial<{ nome: string; email: string; telefone: string; role: "admin" | "corretora"; ativo: boolean; senha: string }>
) {
  return request<{ user: ManagedUser }>(`/api/users/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(data),
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
