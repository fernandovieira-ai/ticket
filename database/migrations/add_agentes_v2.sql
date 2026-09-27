-- ============================================================
-- Modulo Agentes IA v2
-- - analise_painel, query_erros, ultimo_scan em agente_clientes
-- - webhook_token em agente_config
-- - erro_hash em agente_propostas
-- - agente_clientes_bases (multiplas bases por cliente)
-- - agente_regras (knowledge base acumulado pelo agente)
-- ============================================================

-- Campos adicionais em agente_config
ALTER TABLE agente_config
  ADD COLUMN IF NOT EXISTS webhook_token VARCHAR(64) NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex');

-- Campos adicionais em agente_clientes
ALTER TABLE agente_clientes
  ADD COLUMN IF NOT EXISTS query_erros    TEXT,
  ADD COLUMN IF NOT EXISTS analise_painel BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ultimo_scan    TIMESTAMPTZ;

-- Erro hash em agente_propostas (deduplicacao)
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS erro_hash VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_agente_propostas_hash
  ON agente_propostas (empresa_id, erro_hash)
  WHERE erro_hash IS NOT NULL;

-- ============================================================
-- Bases adicionais por cliente (para investigacao pelo agente)
-- ============================================================
CREATE TABLE IF NOT EXISTS agente_clientes_bases (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID         NOT NULL REFERENCES agente_clientes(id) ON DELETE CASCADE,
  empresa_id    UUID         NOT NULL,
  nome          VARCHAR(100) NOT NULL,
  descricao     TEXT,
  db_host       VARCHAR(200) NOT NULL,
  db_porta      INTEGER      NOT NULL DEFAULT 5432,
  db_nome       VARCHAR(100) NOT NULL,
  db_usuario    VARCHAR(100) NOT NULL,
  db_senha      TEXT         NOT NULL,
  db_schema     VARCHAR(50)  NOT NULL DEFAULT 'public',
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_bases_cliente
  ON agente_clientes_bases (cliente_id, ativo);

-- ============================================================
-- Regras aprendidas pelo agente (knowledge base auto-acumulado)
-- ============================================================
CREATE TABLE IF NOT EXISTS agente_regras (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID         NOT NULL,
  cliente_id        UUID         REFERENCES agente_clientes(id) ON DELETE SET NULL,
  pattern           TEXT         NOT NULL,
  pattern_hash      VARCHAR(32)  NOT NULL,
  resumo            VARCHAR(200) NOT NULL,
  solucao           TEXT         NOT NULL,
  bases_consultadas TEXT[]       NOT NULL DEFAULT '{}',
  confianca         DECIMAL(3,2) NOT NULL DEFAULT 0.80,
  vezes_aplicada    INTEGER      NOT NULL DEFAULT 0,
  ativa             BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, pattern_hash)
);

CREATE INDEX IF NOT EXISTS idx_agente_regras_empresa
  ON agente_regras (empresa_id, ativa, confianca DESC);

CREATE INDEX IF NOT EXISTS idx_agente_regras_cliente
  ON agente_regras (cliente_id)
  WHERE cliente_id IS NOT NULL;
