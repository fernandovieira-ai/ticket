-- Novo status terminal: "obsoleta" — a varredura marca uma proposta pendente como obsoleta
-- quando o erro de origem (identificado por painel_codigo) já não aparece mais no painel AS
-- (situacao/reprocessar mudaram por fora do sistema, ex: alguém resolveu manualmente).
-- Não apaga a linha (mantém auditoria/histórico), só tira da fila de aprovação.
ALTER TABLE agente_propostas
  DROP CONSTRAINT IF EXISTS agente_propostas_status_check;

ALTER TABLE agente_propostas
  ADD CONSTRAINT agente_propostas_status_check
    CHECK (status IN ('aguardando','aprovada','rejeitada','aplicada','falhou','obsoleta'));
