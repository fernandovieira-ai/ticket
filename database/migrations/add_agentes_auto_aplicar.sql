-- Execução automática por tipo de erro.
-- O operador marca, ao aprovar e aplicar uma proposta, que aquele TIPO de erro (assinatura = descrição
-- sem os valores específicos) pode ser executado sozinho pelo agente nas próximas ocorrências.
-- Só vale para tipos marcados: sem marcação a proposta sempre fica "aguardando" o operador.
-- Depende de add_agentes_autonomia.sql (tabela agente_autonomia).

ALTER TABLE agente_autonomia
  ADD COLUMN IF NOT EXISTS auto_aplicar     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_aplicar_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_aplicar_por UUID;

CREATE INDEX IF NOT EXISTS idx_agente_autonomia_auto_aplicar
  ON agente_autonomia (empresa_id)
  WHERE auto_aplicar = TRUE;
