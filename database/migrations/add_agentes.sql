-- ============================================================
-- Modulo Agentes IA - tabelas de configuracao e propostas
-- Executar em: digitalrf-help (chamados_db)
-- ============================================================

-- Configuração do agente por empresa
CREATE TABLE IF NOT EXISTS agente_config (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ativo                BOOLEAN      NOT NULL DEFAULT FALSE,
  auto_aprovar_tipos   TEXT[]       NOT NULL DEFAULT '{}',
  notificar_email      BOOLEAN      NOT NULL DEFAULT FALSE,
  notificar_whatsapp   BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id)
);

-- Propostas de correcao geradas pelo agente
CREATE TABLE IF NOT EXISTS agente_propostas (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo               VARCHAR(80)  NOT NULL,
  descricao_erro       TEXT         NOT NULL,
  analise              TEXT         NOT NULL,
  correcao_proposta    TEXT         NOT NULL,
  tipo                 VARCHAR(20)  NOT NULL CHECK (tipo IN ('configuracao','query_sql','logica','permissao','outro')),
  nivel_risco          VARCHAR(10)  NOT NULL CHECK (nivel_risco IN ('baixo','medio','alto','critico')),
  status               VARCHAR(15)  NOT NULL DEFAULT 'aguardando'
                         CHECK (status IN ('aguardando','aprovada','rejeitada','aplicada','falhou')),
  aprovado_por         UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  aplicado_em          TIMESTAMPTZ,
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_propostas_empresa
  ON agente_propostas (empresa_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agente_propostas_status
  ON agente_propostas (empresa_id, status);
