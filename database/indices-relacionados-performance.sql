-- ============================================================================
-- ÍNDICES DE PERFORMANCE PARA TABELAS RELACIONADAS AO SISTEMA DE TICKETS
-- ============================================================================
-- Este script otimiza as tabelas que fazem JOIN frequente com tickets
-- ============================================================================

-- OTIMIZAÇÕES PARA TICKET_STATUS
-- ============================================================================

-- Status ativos por empresa (usado em todos os JOINs)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_status_empresa_ativo_codigo
ON ticket_status (empresa_id, ativo, codigo)
WHERE ativo = true;

-- Status por código para lookups rápidos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_status_codigo_ativo
ON ticket_status (codigo, ativo)
WHERE ativo = true;

-- OTIMIZAÇÕES PARA TICKET_PRIORIDADES
-- ============================================================================

-- Prioridades ativas por empresa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_prioridades_empresa_ativo
ON ticket_prioridades (empresa_id, ativo)
WHERE ativo = true;

-- Prioridades por código para lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_prioridades_codigo_ativo
ON ticket_prioridades (codigo, ativo)
WHERE ativo = true;

-- OTIMIZAÇÕES PARA CLIENTES
-- ============================================================================

-- Clientes ativos por empresa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_empresa_ativo
ON clientes (empresa_id, ativo)
WHERE ativo = true;

-- Índice para busca por nome/razão social
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_nome_razao_gin
ON clientes USING gin (to_tsvector('portuguese', nome_razao))
WHERE ativo = true;

-- OTIMIZAÇÕES PARA USUÁRIOS
-- ============================================================================

-- Usuários ativos por empresa (não clientes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_empresa_perfil_ativo
ON usuarios (empresa_id, perfil, ativo)
WHERE ativo = true AND perfil != 'cliente';

-- Usuários clientes ativos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_empresa_cliente_ativo
ON usuarios (empresa_id, ativo)
WHERE ativo = true AND perfil = 'cliente';

-- OTIMIZAÇÕES PARA DEPARTAMENTOS
-- ============================================================================

-- Departamentos ativos por empresa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departamentos_empresa_ativo
ON departamentos (empresa_id, ativo)
WHERE ativo = true;

-- OTIMIZAÇÕES PARA CATEGORIAS
-- ============================================================================

-- Categorias ativas por empresa
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categorias_empresa_ativo
ON categorias (empresa_id, ativo)
WHERE ativo = true;

-- OTIMIZAÇÕES PARA MENSAGENS
-- ============================================================================

-- Mensagens por ticket ordenadas por criação
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensagens_ticket_criado
ON mensagens (ticket_id, criado_em ASC);

-- Mensagens públicas por ticket (para clientes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensagens_ticket_publica_criado
ON mensagens (ticket_id, criado_em ASC)
WHERE interna = false;

-- Mensagens por autor para relatórios
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mensagens_autor_criado
ON mensagens (autor_id, criado_em DESC);

-- OTIMIZAÇÕES PARA SLA_LOGS
-- ============================================================================

-- SLA logs por ticket
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sla_logs_ticket_tipo_criado
ON sla_logs (ticket_id, tipo, criado_em DESC);

-- SLA logs violados para relatórios
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sla_logs_violado_criado
ON sla_logs (violado, criado_em DESC)
WHERE violado = true;

-- OTIMIZAÇÕES PARA ANEXOS (se existir)
-- ============================================================================

-- Verificar se a tabela anexos existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anexos') THEN
        -- Anexos por ticket
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anexos_ticket_criado
        ON anexos (ticket_id, criado_em ASC);

        -- Anexos por tipo
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anexos_ticket_tipo
        ON anexos (ticket_id, tipo);
    END IF;
END $$;

-- OTIMIZAÇÕES PARA USUARIO_CLIENTES (tabela de relacionamento)
-- ============================================================================

-- Verificar se a tabela usuario_clientes existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuario_clientes') THEN
        -- Relação usuário-cliente para validações rápidas
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuario_clientes_usuario_cliente
        ON usuario_clientes (usuario_id, cliente_id);

        -- Clientes por usuário
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuario_clientes_cliente_usuario
        ON usuario_clientes (cliente_id, usuario_id);
    END IF;
END $$;

-- ============================================================================
-- ATUALIZAÇÕES DE ESTATÍSTICAS
-- ============================================================================

-- Atualizar estatísticas de todas as tabelas otimizadas
ANALYZE ticket_status;
ANALYZE ticket_prioridades;
ANALYZE clientes;
ANALYZE usuarios;
ANALYZE departamentos;
ANALYZE categorias;
ANALYZE mensagens;
ANALYZE sla_logs;

-- Verificar se anexos existe antes de analisar
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anexos') THEN
        ANALYZE anexos;
    END IF;
END $$;

-- Verificar se usuario_clientes existe antes de analisar
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuario_clientes') THEN
        ANALYZE usuario_clientes;
    END IF;
END $$;

-- ============================================================================
-- QUERY DE MONITORAMENTO PARA TODAS AS TABELAS
-- ============================================================================

/*
-- Verificar uso de todos os índices criados
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as "Times Used",
  pg_size_pretty(pg_relation_size(indexrelname::regclass)) as "Index Size"
FROM pg_stat_user_indexes
WHERE tablename IN (
  'tickets', 'ticket_status', 'ticket_prioridades', 'clientes',
  'usuarios', 'departamentos', 'categorias', 'mensagens', 'sla_logs', 'anexos'
)
ORDER BY tablename, idx_scan DESC;
*/

-- ============================================================================
-- NOTAS
-- ============================================================================
--
-- 1. Todos os índices usam CONCURRENTLY para não bloquear operações
-- 2. Índices parciais são usados para reduzir tamanho
-- 3. Índices compostos seguem ordem de seletividade
-- 4. GIN index para busca textual em nome_razao dos clientes
-- 5. Tratamento de tabelas opcionais com blocos DO $$
--
-- ============================================================================