-- ============================================================
-- Controle de liberacao de clientes SaaS (ERP DigitalRF)
-- Executar em: digitalrf-help (drfticket)
-- Tabela de controle interna - independente do saas_control do ERP
-- por enquanto (ver nota "para depois ser migrado" na decisao do painel
-- Configuracoes > SaaS).
-- ============================================================

CREATE TABLE IF NOT EXISTS saas_instancias (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(50)  NOT NULL UNIQUE,
  database_name   VARCHAR(63)  NOT NULL UNIQUE,
  nome_cliente    VARCHAR(150) NOT NULL,
  dominio         VARCHAR(255),
  plano           VARCHAR(20)  NOT NULL DEFAULT 'basico',
  status          VARCHAR(20)  NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo','suspenso','cancelado','trial')),
  token_api       VARCHAR(80)  UNIQUE,
  obs             TEXT,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_instancias_status ON saas_instancias (status);
