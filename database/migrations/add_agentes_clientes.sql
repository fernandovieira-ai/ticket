-- ============================================================
-- Modulo Agentes IA - tabela de clientes (bases externas)
-- Executar em: drfticket
-- ============================================================

-- Clientes cadastrados para analise pelo agente
CREATE TABLE IF NOT EXISTS agente_clientes (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(100) NOT NULL,
  slug          VARCHAR(50)  NOT NULL,
  db_host       VARCHAR(200) NOT NULL,
  db_porta      INTEGER      NOT NULL DEFAULT 5432,
  db_nome       VARCHAR(100) NOT NULL,
  db_usuario    VARCHAR(100) NOT NULL,
  db_senha      TEXT         NOT NULL,
  db_schema     VARCHAR(50)  NOT NULL DEFAULT 'public',
  notas         TEXT,
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_agente_clientes_empresa
  ON agente_clientes (empresa_id, ativo);

-- Adicionar cliente_id em agente_propostas (pode ser NULL para erros sem cliente)
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES agente_clientes(id) ON DELETE SET NULL;

ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(100);
