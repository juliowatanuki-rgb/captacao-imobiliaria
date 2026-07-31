-- Suporte a exportacao incremental de 100% dos anuncios (qualquer status)
-- para uma planilha do Google Sheets, como arquivo historico que nunca e
-- apagado - independente do status de triagem (pendente/analisado/
-- descartado) ou de o anuncio ter saido do ar (ausente). A coluna marca
-- quando cada anuncio ja foi escrito na planilha, para a sincronizacao so
-- adicionar linhas novas a cada execucao (nunca reescrever/apagar linhas).
ALTER TABLE listings ADD COLUMN sheets_exportado_em timestamptz;

CREATE INDEX idx_listings_sheets_pendentes ON listings (primeira_captura_em)
  WHERE sheets_exportado_em IS NULL;
