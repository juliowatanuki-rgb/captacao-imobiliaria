-- Rebaseline controlado de sites que trocaram de plataforma.
--
-- Aetherna saiu de Coruja para Kenlo e Tavares e Polati saiu de Praedium
-- para Market Imovel. Os IDs desses motores nao sao compativeis. Manter as
-- linhas antigas como ativas faria a primeira coleta nova parecer uma falha
-- de scraping e impediria o cadastro do inventario atual. As linhas antigas
-- permanecem no historico, mas deixam de participar do inventario ativo.
WITH antigos AS (
  UPDATE listings
     SET status = 'removido',
         ausente_desde = COALESCE(ausente_desde, now()),
         coletas_ausente_consecutivas = GREATEST(coletas_ausente_consecutivas, 1)
   WHERE site_id IN ('aetherna_empreendimentos', 'tavares_e_polati_imoveis')
     AND status IN ('ativo', 'ausente')
  RETURNING id
)
INSERT INTO listing_events (listing_id, tipo, detalhe)
SELECT id, 'marked_removed', 'rebaseline: migracao de plataforma; inventario antigo preservado no historico'
  FROM antigos;
