-- Otimizações de índices para o monitorador
-- Execute este script para melhorar a performance das queries

-- Índice para detecção de perda de comunicação
-- Melhora a performance do CASE WHEN ultimo_contato < NOW() - INTERVAL '3 minutes'
CREATE INDEX IF NOT EXISTS idx_monitor_heartbeat_ultimo_contato
ON drf_monitor_heartbeat(ultimo_contato DESC);

-- Índice composto para lookup eficiente de processos ativos por máquina
CREATE INDEX IF NOT EXISTS idx_monitor_processos_machine_ativo
ON drf_monitor_processos(machine_uuid, ativo)
WHERE ativo = true;

-- Índice para agrupamento por nome de rede
CREATE INDEX IF NOT EXISTS idx_monitor_rede_nome_rede
ON drf_monitor_rede(nome_rede);

-- Estatísticas de performance (opcional - descomentar para análise)
-- EXPLAIN ANALYZE
-- SELECT machine_uuid, ultimo_contato, status,
--   CASE WHEN ultimo_contato < NOW() - INTERVAL '3 minutes' THEN 'sem_sinal' ELSE status END
-- FROM drf_monitor_heartbeat;
