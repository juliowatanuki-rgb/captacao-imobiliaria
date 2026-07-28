-- Suporte a otimizacao da 2a+ execucao de coleta (dedup na mesma execucao +
-- pular update quando nada mudou): colunas novas para o log continuar
-- distinguindo "existente sem alteracao" de "existente e realmente atualizado",
-- e quantos duplicados dentro da mesma coleta foram descartados antes de gravar.
ALTER TABLE site_crawl_runs
  ADD COLUMN anuncios_sem_alteracao int NOT NULL DEFAULT 0,
  ADD COLUMN anuncios_duplicados_coleta int NOT NULL DEFAULT 0;
