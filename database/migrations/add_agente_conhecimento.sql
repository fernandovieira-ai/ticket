-- Base de conhecimento consolidada: quando uma proposta é aprovada e o operador salva o
-- aprendizado, extraímos a LIÇÃO GENERALIZADA (sem valores específicos de uma ocorrência,
-- ex: sem o código IBGE exato, só o padrão) e guardamos aqui, deduplicada por tópico.
-- Diferente de agente_regras (1 linha por erro exato, pra reaplicar o mesmo SQL de novo),
-- esta tabela cresce pouco: cada tópico tem NO MÁXIMO 1 linha, reforçada/atualizada a cada
-- nova aprovação relacionada, em vez de uma linha nova por ocorrência.
CREATE TABLE IF NOT EXISTS agente_conhecimento (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID         NOT NULL,
  cliente_id      UUID         REFERENCES agente_clientes(id) ON DELETE SET NULL,
  topico          VARCHAR(120) NOT NULL,
  resumo          TEXT         NOT NULL,
  vezes_reforcada INTEGER      NOT NULL DEFAULT 1,
  ativa           BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, topico)
);

CREATE INDEX IF NOT EXISTS idx_agente_conhecimento_empresa
  ON agente_conhecimento (empresa_id, ativa);
