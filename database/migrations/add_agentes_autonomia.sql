-- Autonomia progressiva do agente.
-- O agente só aplica correções sozinho para uma "família" de erros (assinatura = descrição do erro
-- sem os valores específicos) depois de acumular sucessos CONFIRMADOS: o SQL foi aplicado e o erro
-- realmente sumiu do painel. Qualquer recaída ou rejeição humana zera essa confiança.
-- Tudo nasce DESLIGADO (autonomia_ativa = FALSE) — nada muda até o operador ligar em Configuração.

ALTER TABLE agente_config
  ADD COLUMN IF NOT EXISTS autonomia_ativa          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autonomia_min_sucessos   INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS autonomia_limite_diario  INTEGER NOT NULL DEFAULT 10;

-- Auditoria: quem aplicou e se o resultado foi confirmado depois
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS aplicado_por_agente BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmado_em       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agente_propostas_aplicadas_pendentes
  ON agente_propostas (empresa_id, cliente_id, aplicado_em)
  WHERE status = 'aplicada' AND confirmado_em IS NULL;

-- Confiança por família de erro (assinatura_hash = hash da descrição normalizada)
CREATE TABLE IF NOT EXISTS agente_autonomia (
  empresa_id            UUID         NOT NULL,
  assinatura_hash       VARCHAR(32)  NOT NULL,
  assinatura            TEXT         NOT NULL,          -- descrição normalizada (legível, p/ auditoria)
  sucessos_confirmados  INTEGER      NOT NULL DEFAULT 0, -- seguidos, sem recaída nem rejeição
  falhas_consecutivas   INTEGER      NOT NULL DEFAULT 0,
  total_sucessos        INTEGER      NOT NULL DEFAULT 0,
  total_falhas          INTEGER      NOT NULL DEFAULT 0,
  ultima_confirmacao_em TIMESTAMPTZ,
  ultima_falha_em       TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, assinatura_hash)
);

-- Regras aprendidas passam a ser encontráveis também pela assinatura (caso análogo com valores diferentes)
ALTER TABLE agente_regras
  ADD COLUMN IF NOT EXISTS assinatura_hash VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_agente_regras_assinatura
  ON agente_regras (empresa_id, assinatura_hash)
  WHERE assinatura_hash IS NOT NULL;

-- Busca das lições por relevância (full-text, sem depender de extensão)
CREATE INDEX IF NOT EXISTS idx_agente_conhecimento_fts
  ON agente_conhecimento USING gin (to_tsvector('portuguese', topico || ' ' || resumo));
