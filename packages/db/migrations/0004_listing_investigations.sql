-- Prova de conceito: investigacao de localizacao de anuncios via Gemini API
-- (visao computacional + dados do anuncio). Tabela separada de `listings`
-- porque e um resultado de IA (auditavel, reprocessavel, pode ter varias
-- tentativas por anuncio), diferente de condominio_identificado_manual /
-- endereco_identificado_manual que sao preenchidos por uma corretora.
CREATE TABLE listing_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  condominio text,
  endereco text,
  bairro text,
  cidade text,
  confianca int CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 100)),
  status text NOT NULL CHECK (status IN ('localizado', 'parcial', 'nao_localizado', 'erro')),
  evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  divergencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  criterio_confirmacao text,
  fotos_analisadas int NOT NULL DEFAULT 0,
  fontes_externas_pesquisadas int NOT NULL DEFAULT 0,
  modelo_usado text NOT NULL,
  tokens_prompt int,
  tokens_resposta int,
  tempo_processamento_ms int NOT NULL,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listing_investigations_listing_id ON listing_investigations (listing_id);
