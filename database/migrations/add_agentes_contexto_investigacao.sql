-- Guarda o contexto das investigações para não refazê-las a cada "Refinar com IA":
--  * dados_investigacao    : queries + resultados reais já coletados (sem duplicatas, limitado)
--  * instrucoes_anteriores : instruções que o operador já enviou nos refinamentos
--  * agente_schema_cache   : colunas já descobertas por (cliente, base, tabela), reaproveitadas em qualquer erro do cliente
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS dados_investigacao TEXT,
  ADD COLUMN IF NOT EXISTS instrucoes_anteriores JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS agente_schema_cache (
  cliente_id     UUID         NOT NULL REFERENCES agente_clientes(id) ON DELETE CASCADE,
  empresa_id     UUID         NOT NULL,
  base           TEXT         NOT NULL,
  tabela         TEXT         NOT NULL,
  colunas        TEXT         NOT NULL,
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cliente_id, base, tabela)
);

CREATE INDEX IF NOT EXISTS idx_agente_schema_cache_cliente
  ON agente_schema_cache (cliente_id, atualizado_em DESC);
