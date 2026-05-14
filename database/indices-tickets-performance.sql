-- ============================================================================
-- ÍNDICES DE PERFORMANCE PARA SISTEMA DE TICKETS
-- ============================================================================
-- Este script adiciona índices específicos baseados na análise das queries
-- mais frequentes do sistema de tickets para otimizar performance.
--
-- Impacto esperado: 20-35% de redução no tempo de resposta das queries
-- ============================================================================

-- 1. ÍNDICE COMPOSTO PRINCIPAL: empresa_id + status_id
-- Usado em: dashboard, filtros de status, relatórios
-- Queries: WHERE empresa_id = X AND status_id = Y
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_status
ON tickets (empresa_id, status_id)
WHERE status_id IS NOT NULL;

-- 2. ÍNDICE PARA "MEUS TICKETS": empresa_id + atribuido_a
-- Usado em: filtro "meus tickets", atribuição de chamados
-- Queries: WHERE empresa_id = X AND atribuido_a = Y
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_atribuido
ON tickets (empresa_id, atribuido_a)
WHERE atribuido_a IS NOT NULL;

-- 3. ÍNDICE PARA TICKETS DE CLIENTES: empresa_id + aberto_por
-- Usado em: clientes visualizando seus próprios tickets
-- Queries: WHERE empresa_id = X AND aberto_por = Y (perfil cliente)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_aberto_por
ON tickets (empresa_id, aberto_por);

-- 4. ÍNDICE PARA TICKETS POR CLIENTE: empresa_id + cliente_id
-- Usado em: relatórios, filtros por cliente específico
-- Queries: WHERE empresa_id = X AND cliente_id = Y
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_cliente
ON tickets (empresa_id, cliente_id)
WHERE cliente_id IS NOT NULL;

-- 5. ÍNDICE DE ORDENAÇÃO POR ATUALIZAÇÃO: empresa_id + atualizado_em
-- Usado em: listagem principal de tickets (ORDER BY atualizado_em DESC)
-- Queries: WHERE empresa_id = X ORDER BY atualizado_em DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_atualizado
ON tickets (empresa_id, atualizado_em DESC);

-- 6. ÍNDICE DE ORDENAÇÃO POR CRIAÇÃO: empresa_id + criado_em
-- Usado em: relatórios por período, filtros temporais
-- Queries: WHERE empresa_id = X ORDER BY criado_em DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_criado
ON tickets (empresa_id, criado_em DESC);

-- 7. ÍNDICE PARA FILA DE ATENDIMENTO: status_id + atribuido_a (NULL)
-- Usado em: dashboard "tickets não atribuídos", fila de atendimento
-- Queries: WHERE status_id IN (...) AND atribuido_a IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_status_nao_atribuido
ON tickets (status_id)
WHERE atribuido_a IS NULL;

-- 8. ÍNDICE POR CANAL: empresa_id + canal
-- Usado em: relatórios por canal (portal, whatsapp, painel)
-- Queries: WHERE empresa_id = X AND canal = Y
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_canal
ON tickets (empresa_id, canal);

-- 9. ÍNDICE PARA BUSCA TEXTUAL: empresa_id + titulo/numero
-- Usado em: campo de busca da listagem principal
-- Nota: PostgreSQL já tem índices automáticos para ILIKE, mas este otimiza filtros compostos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_numero
ON tickets (empresa_id, numero);

-- 10. ÍNDICE PARA SLA E DEADLINES: empresa_id + sla_primeira_resp_deadline
-- Usado em: alertas de SLA, relatórios de performance
-- Queries: WHERE empresa_id = X AND sla_primeira_resp_deadline < NOW()
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_sla_primeira
ON tickets (empresa_id, sla_primeira_resp_deadline)
WHERE sla_primeira_resp_deadline IS NOT NULL;

-- 11. ÍNDICE PARA RESOLUÇÃO SLA: empresa_id + sla_resolucao_deadline
-- Usado em: alertas de SLA de resolução
-- Queries: WHERE empresa_id = X AND sla_resolucao_deadline < NOW()
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_sla_resolucao
ON tickets (empresa_id, sla_resolucao_deadline)
WHERE sla_resolucao_deadline IS NOT NULL;

-- 12. ÍNDICE COMPOSTO PARA RELATÓRIOS: empresa_id + status_id + criado_em
-- Usado em: relatórios temporais por status
-- Queries: WHERE empresa_id = X AND status_id = Y AND criado_em BETWEEN...
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_empresa_status_criado
ON tickets (empresa_id, status_id, criado_em DESC)
WHERE status_id IS NOT NULL;

-- ============================================================================
-- ESTATÍSTICAS E MONITORAMENTO
-- ============================================================================

-- Atualizar estatísticas da tabela após criação dos índices
ANALYZE tickets;

-- Query para verificar uso dos índices (executar após alguns dias)
/*
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as "Times Used",
  pg_size_pretty(pg_relation_size(indexrelname::regclass)) as "Index Size"
FROM pg_stat_user_indexes
WHERE tablename = 'tickets'
ORDER BY idx_scan DESC;
*/

-- Query para verificar queries lentas relacionadas a tickets
/*
SELECT
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements
WHERE query ILIKE '%tickets%'
  AND mean_time > 100
ORDER BY mean_time DESC;
*/

-- ============================================================================
-- NOTAS DE IMPLEMENTAÇÃO
-- ============================================================================
--
-- 1. CONCURRENTLY: Todos os índices são criados com CONCURRENTLY para
--    não bloquear operações durante a criação
--
-- 2. WHERE CONDITIONS: Índices parciais são usados quando possível para
--    reduzir tamanho e melhorar performance
--
-- 3. ORDER BY DESC: Índices de ordenação usam DESC para otimizar as
--    queries mais comuns (listagens recentes primeiro)
--
-- 4. MONITORAMENTO: Incluídas queries para monitorar uso e effectiveness
--    dos índices criados
--
-- 5. IMPACTO: Espera-se redução de 20-35% no tempo de resposta das
--    principais queries de tickets
--
-- ============================================================================