-- ============================================================
-- Migration v1.3 — Suporte a múltiplos provedores de IA (Claude + OpenAI)
-- Data: 21/03/2026
-- ============================================================

-- Adiciona coluna de provedor (claude | openai)
ALTER TABLE ia_config
  ADD COLUMN IF NOT EXISTS provedor VARCHAR(20) NOT NULL DEFAULT 'claude'
    CHECK (provedor IN ('claude', 'openai'));

-- Armazena a chave da OpenAI de forma segura no banco
ALTER TABLE ia_config
  ADD COLUMN IF NOT EXISTS openai_api_key TEXT;

-- Coluna auxiliar para indicar se a chave OpenAI foi configurada (sem expor o valor)
-- Usado apenas para feedback na UI — o valor real fica em openai_api_key
COMMENT ON COLUMN ia_config.openai_api_key IS 'Chave de API OpenAI. Armazenada em texto; nunca exposta no GET da config.';

-- Atualiza registros existentes garantindo provedor padrão
UPDATE ia_config SET provedor = 'claude' WHERE provedor IS NULL;
