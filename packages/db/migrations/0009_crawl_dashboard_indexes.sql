-- Índices para as consultas do dashboard e para a marcação de ausentes por site.
CREATE INDEX idx_listings_primeira_captura_em
  ON listings (primeira_captura_em DESC);

CREATE INDEX idx_listings_site_status_id
  ON listings (site_id, status, id);

CREATE INDEX idx_listing_events_criado_em_tipo
  ON listing_events (criado_em DESC, tipo);
