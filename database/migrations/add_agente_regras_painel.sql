-- Regras de ação por TIPO DE ERRO do Painel de Erros. A classificação do texto do erro em categoria/causa
-- continua em código (agents/core/classificar.ts — é análise de texto, não dado do operador), mas O QUE
-- FAZER com cada categoria (só reprocessar, ajustar um campo e reprocessar, elegível a automático, exige
-- operador) fica aqui: o operador muda pela tela sem precisar de deploy. Sem linha para uma categoria,
-- o app usa um padrão embutido (agents/core/regras-painel.ts) — nunca quebra por falta de configuração.

CREATE TABLE IF NOT EXISTS agente_regras_painel (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL,
  categoria     TEXT NOT NULL,
  modo          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (modo IN ('somente_reprocessar', 'ajustar_pagamento', 'elegivel_automatico', 'assistido', 'manual')),
  titulo        TEXT NOT NULL DEFAULT '',
  descricao     TEXT NOT NULL DEFAULT '',
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, categoria)
);
