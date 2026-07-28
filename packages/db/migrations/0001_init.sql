-- Schema inicial do sistema de captacao inteligente de imoveis.
-- Ver secao 11 e 12 da especificacao do projeto.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  nome text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'corretora')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- site_id usado como slug legivel (ex: 'imobiliaria_a') em vez de uuid,
-- porque a identity_key e os exemplos da especificacao referenciam o site por slug.
CREATE TABLE monitored_sites (
  id text PRIMARY KEY,
  nome text NOT NULL,
  url_base text NOT NULL,
  url_listagem text NOT NULL,
  plataforma text,
  ativo boolean NOT NULL DEFAULT true,
  is_agregador boolean NOT NULL DEFAULT false,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL REFERENCES monitored_sites(id),
  identity_type text NOT NULL CHECK (identity_type IN ('external', 'url_hash', 'fingerprint')),
  identity_key text NOT NULL,
  identity_version int NOT NULL DEFAULT 1,
  identity_confidence text NOT NULL CHECK (identity_confidence IN ('forte', 'fraca')),
  external_id text,
  url_original text NOT NULL,
  url_final text,
  url_normalizada text,
  url_hash text,
  fingerprint text,
  titulo text,
  tipo_imovel text,
  cidade text,
  bairro text,
  preco numeric(14, 2),
  area_util numeric(10, 2),
  dormitorios int,
  suites int,
  banheiros int,
  vagas int,
  condominio_nome text,
  endereco text,
  descricao text,
  primeira_captura_em timestamptz NOT NULL DEFAULT now(),
  ultima_captura_em timestamptz NOT NULL DEFAULT now(),
  ausente_desde timestamptz,
  coletas_ausente_consecutivas int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'ausente', 'removido')),
  analysis_status text NOT NULL DEFAULT 'pendente'
    CHECK (analysis_status IN ('pendente', 'analisado', 'descartado', 'selecionado_para_captacao')),
  observacoes_corretora text,
  condominio_identificado_manual text,
  endereco_identificado_manual text,
  -- Constraint principal (secao 12): impede duplicidade dentro da mesma imobiliaria,
  -- mas permite o mesmo imovel existir em imobiliarias diferentes.
  UNIQUE (site_id, identity_key)
);

CREATE INDEX idx_listings_site_id ON listings (site_id);
CREATE INDEX idx_listings_analysis_status ON listings (analysis_status) WHERE status = 'ativo';
CREATE INDEX idx_listings_status ON listings (status);

CREATE TABLE crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio_em timestamptz NOT NULL DEFAULT now(),
  fim_em timestamptz,
  status text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'sucesso', 'sucesso_parcial', 'erro')),
  sites_previstos int NOT NULL DEFAULT 0,
  sites_sucesso int NOT NULL DEFAULT 0,
  sites_alerta int NOT NULL DEFAULT 0,
  sites_erro int NOT NULL DEFAULT 0,
  total_anuncios_encontrados int NOT NULL DEFAULT 0,
  total_anuncios_novos int NOT NULL DEFAULT 0,
  total_anuncios_atualizados int NOT NULL DEFAULT 0,
  mensagem text
);

CREATE TABLE site_crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_run_id uuid NOT NULL REFERENCES crawl_runs(id),
  site_id text NOT NULL REFERENCES monitored_sites(id),
  inicio_em timestamptz NOT NULL DEFAULT now(),
  fim_em timestamptz,
  status text NOT NULL CHECK (status IN ('sucesso', 'alerta', 'erro')),
  paginas_visitadas int NOT NULL DEFAULT 0,
  anuncios_encontrados int NOT NULL DEFAULT 0,
  anuncios_novos int NOT NULL DEFAULT 0,
  anuncios_existentes int NOT NULL DEFAULT 0,
  anuncios_atualizados int NOT NULL DEFAULT 0,
  anuncios_ausentes int NOT NULL DEFAULT 0,
  mensagem_erro text,
  detalhe_tecnico text
);

CREATE INDEX idx_site_crawl_runs_crawl_run_id ON site_crawl_runs (crawl_run_id);
CREATE INDEX idx_site_crawl_runs_site_id ON site_crawl_runs (site_id);

CREATE TABLE listing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  tipo text NOT NULL CHECK (tipo IN (
    'created_from_initial_seed',
    'created_as_new',
    'updated',
    'marked_absent',
    'marked_removed',
    'marked_analyzed',
    'marked_discarded',
    'marked_selected_for_capture'
  )),
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES users(id),
  detalhe text
);

CREATE INDEX idx_listing_events_listing_id ON listing_events (listing_id);
