// Tipos compartilhados entre api, web e crawlers.
// Espelham as tabelas descritas na especificacao (secao 11).

export type UserRole = "admin" | "corretora";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  nome: string;
  role: UserRole;
  criadoEm: string;
}

export interface MonitoredSite {
  id: string;
  nome: string;
  urlBase: string;
  urlListagem: string;
  plataforma: string | null;
  ativo: boolean;
  isAgregador: boolean;
  observacoes: string | null;
  criadoEm: string;
}

export type IdentityType = "external" | "url_hash" | "fingerprint";

export type ListingStatus = "ativo" | "ausente" | "removido";

export type AnalysisStatus =
  | "pendente"
  | "analisado"
  | "descartado"
  | "selecionado_para_captacao";

export interface Listing {
  id: string;
  siteId: string;
  identityType: IdentityType;
  identityKey: string;
  identityVersion: number;
  identityConfidence: "forte" | "fraca";
  externalId: string | null;
  urlOriginal: string;
  urlFinal: string | null;
  urlNormalizada: string | null;
  urlHash: string | null;
  fingerprint: string | null;
  titulo: string | null;
  tipoImovel: string | null;
  cidade: string | null;
  bairro: string | null;
  preco: number | null;
  areaUtil: number | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  condominioNome: string | null;
  endereco: string | null;
  descricao: string | null;
  primeiraCapturaEm: string;
  ultimaCapturaEm: string;
  ausenteDesde: string | null;
  coletasAusenteConsecutivas: number;
  status: ListingStatus;
  analysisStatus: AnalysisStatus;
  observacoesCorretora: string | null;
  condominioIdentificadoManual: string | null;
  enderecoIdentificadoManual: string | null;
}

export type CrawlRunStatus = "em_andamento" | "sucesso" | "sucesso_parcial" | "erro";

export interface CrawlRun {
  id: string;
  inicioEm: string;
  fimEm: string | null;
  status: CrawlRunStatus;
  sitesPrevistos: number;
  sitesSucesso: number;
  sitesAlerta: number;
  sitesErro: number;
  totalAnunciosEncontrados: number;
  totalAnunciosNovos: number;
  totalAnunciosAtualizados: number;
  mensagem: string | null;
}

export type SiteCrawlRunStatus = "sucesso" | "alerta" | "erro";

export interface SiteCrawlRun {
  id: string;
  crawlRunId: string;
  siteId: string;
  inicioEm: string;
  fimEm: string | null;
  status: SiteCrawlRunStatus;
  paginasVisitadas: number;
  anunciosEncontrados: number;
  anunciosNovos: number;
  anunciosExistentes: number;
  anunciosAtualizados: number;
  anunciosAusentes: number;
  mensagemErro: string | null;
  detalheTecnico: string | null;
}

export type ListingEventType =
  | "created_from_initial_seed"
  | "created_as_new"
  | "updated"
  | "marked_absent"
  | "marked_removed"
  | "marked_analyzed"
  | "marked_discarded"
  | "marked_selected_for_capture";

export interface ListingEvent {
  id: string;
  listingId: string;
  tipo: ListingEventType;
  criadoEm: string;
  criadoPor: string | null;
  detalhe: string | null;
}

// Payload extraido por um crawler para um unico anuncio, antes de virar Listing.
export interface ScrapedListing {
  externalId?: string | null;
  urlOriginal: string;
  urlFinal?: string | null;
  titulo?: string | null;
  tipoImovel?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  preco?: number | null;
  areaUtil?: number | null;
  dormitorios?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  condominioNome?: string | null;
  endereco?: string | null;
  descricao?: string | null;
}
