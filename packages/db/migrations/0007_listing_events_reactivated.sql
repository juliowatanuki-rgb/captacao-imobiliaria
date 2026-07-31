-- Adiciona o tipo 'reactivated' a listing_events (secao "otimizacao de
-- armazenamento e eventos" - analise de 2026-07-31): a partir de agora,
-- upsertListingsBatch grava 'reactivated' quando um anuncio que estava
-- ausente/removido reaparece, em vez do generico 'updated'. Mudanca pura de
-- atributo (preco/titulo/etc em anuncio ja ativo) deixa de gerar QUALQUER
-- evento - so atualiza a linha em `listings`.
--
-- 'updated' permanece na lista permitida (nao removido do CHECK) porque ja
-- existem 4668 eventos historicos desse tipo em producao e esta migration
-- nao apaga nada - só passa a nao ser mais usado por codigo novo.
ALTER TABLE listing_events DROP CONSTRAINT listing_events_tipo_check;

ALTER TABLE listing_events ADD CONSTRAINT listing_events_tipo_check CHECK (tipo IN (
  'created_from_initial_seed',
  'created_as_new',
  'updated',
  'reactivated',
  'marked_absent',
  'marked_removed',
  'marked_analyzed',
  'marked_discarded',
  'marked_selected_for_capture'
));
