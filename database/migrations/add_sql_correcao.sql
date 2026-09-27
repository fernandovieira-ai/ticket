-- Adiciona suporte a SQL executável nas propostas do agente IA
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS sql_correcao    TEXT,
  ADD COLUMN IF NOT EXISTS aplicacao_erro  TEXT;
