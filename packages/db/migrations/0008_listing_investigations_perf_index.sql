-- Auditoria de performance de 2026-08-01 (painel lento): a query de
-- /api/listings/new (fila "Anuncios novos") faz um LEFT JOIN LATERAL por
-- linha em listing_investigations (WHERE listing_id = l.id AND status <>
-- 'erro' ORDER BY criado_em DESC LIMIT 1). So havia indice em (listing_id),
-- sem cobrir a ordenacao - com muitas tentativas de investigacao por
-- anuncio (reprocessamento), isso viraria um sort em memoria por linha.
-- Indice composto cobre a busca e a ordenacao juntas.
CREATE INDEX idx_listing_investigations_listing_id_criado_em
  ON listing_investigations (listing_id, criado_em DESC);
