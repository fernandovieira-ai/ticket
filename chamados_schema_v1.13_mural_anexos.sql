-- v1.13: Adiciona coluna anexos (JSONB) na tabela intranet.mensagens
-- Permite armazenar múltiplos arquivos por mensagem do mural de recados

ALTER TABLE intranet.mensagens
  ADD COLUMN IF NOT EXISTS anexos JSONB NOT NULL DEFAULT '[]'::jsonb;
