-- v1.14: Adiciona controle de alertas de atraso nos chamados
-- Evita spam: registra quando o último alerta WhatsApp foi enviado por ticket

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ultimo_alerta_atraso_em TIMESTAMPTZ;

-- Índice parcial: só interessa buscar tickets abertos com prazo definido
CREATE INDEX IF NOT EXISTS idx_tickets_alerta_atraso
  ON tickets(empresa_id, sla_resolucao_deadline, ultimo_alerta_atraso_em)
  WHERE sla_resolucao_deadline IS NOT NULL AND fechado_em IS NULL;
