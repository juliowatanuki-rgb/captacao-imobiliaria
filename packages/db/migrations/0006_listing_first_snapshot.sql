-- Snapshot imutavel da 1a captura de cada anuncio, para a exportacao ao
-- Google Sheets nunca refletir mudancas posteriores de preco/status/
-- descricao/etc (a tabela `listings` e mutavel - upsertListing.ts sobrescreve
-- essas colunas a cada nova coleta). Uma linha por listing_id, criada uma
-- unica vez (na 1a insercao em listings) e nunca atualizada depois -
-- ver upsertListing.ts (bloco de INSERT em lote) e sheets-sync/src/exportar.ts.
CREATE TABLE listing_first_snapshot (
  listing_id uuid PRIMARY KEY REFERENCES listings(id),
  site_id text NOT NULL REFERENCES monitored_sites(id),
  identity_key text NOT NULL,
  external_id text,
  site_nome text NOT NULL,
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
  url_original text NOT NULL,
  url_normalizada text,
  primeira_captura_em timestamptz NOT NULL,
  status_primeira_captura text NOT NULL,
  -- true para anuncios que ja existiam antes desta migration: para eles nao
  -- e possivel recuperar os valores exatos da 1a captura real (ja foram
  -- sobrescritos em `listings` por coletas anteriores), entao o snapshot
  -- abaixo e reconstruido com os dados atuais disponiveis no banco, nao com
  -- o valor historico verdadeiro.
  reconstruido boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listing_first_snapshot_site_id ON listing_first_snapshot (site_id);

-- Backfill: cria o snapshot (marcado como reconstruido) para todo anuncio ja
-- existente antes desta migration. Idempotente por causa do NOT EXISTS e do
-- controle de migrations ja aplicadas (schema_migrations).
INSERT INTO listing_first_snapshot (
  listing_id, site_id, identity_key, external_id, site_nome,
  titulo, tipo_imovel, cidade, bairro, preco, area_util,
  dormitorios, suites, banheiros, vagas, condominio_nome, endereco, descricao,
  url_original, url_normalizada, primeira_captura_em, status_primeira_captura,
  reconstruido
)
SELECT
  l.id, l.site_id, l.identity_key, l.external_id, s.nome,
  l.titulo, l.tipo_imovel, l.cidade, l.bairro, l.preco, l.area_util,
  l.dormitorios, l.suites, l.banheiros, l.vagas, l.condominio_nome, l.endereco, l.descricao,
  l.url_original, l.url_normalizada, l.primeira_captura_em, l.status,
  true
FROM listings l
JOIN monitored_sites s ON s.id = l.site_id
WHERE NOT EXISTS (
  SELECT 1 FROM listing_first_snapshot fs WHERE fs.listing_id = l.id
);
