-- Suporte a tela de gestao de usuarios no admin (secao "usuarios"): telefone
-- e um dado de contato simples, ativo/inativo permite desativar acesso sem
-- apagar o historico (criado_por em listing_events referencia o usuario).
ALTER TABLE users
  ADD COLUMN telefone text,
  ADD COLUMN ativo boolean NOT NULL DEFAULT true;
