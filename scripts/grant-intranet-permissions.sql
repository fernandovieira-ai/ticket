-- Script para liberar permissões do schema intranet
-- Execute este script como superuser ou owner do banco

-- Assumindo que o usuário do Railway é 'postgres' ou similar
-- Substitua 'railway_user' pelo usuário real usado no Railway

-- Liberar acesso ao schema intranet
GRANT USAGE ON SCHEMA intranet TO postgres;
GRANT USAGE ON SCHEMA intranet TO railway_user; -- caso seja um usuário específico

-- Liberar permissões nas tabelas existentes
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA intranet TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA intranet TO railway_user;

-- Liberar permissões em sequences (para IDs auto-incrementais)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA intranet TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA intranet TO railway_user;

-- Garantir permissões em futuras tabelas
ALTER DEFAULT PRIVILEGES IN SCHEMA intranet GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA intranet GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO railway_user;

-- Garantir permissões em futuras sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA intranet GRANT USAGE, SELECT ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA intranet GRANT USAGE, SELECT ON SEQUENCES TO railway_user;

-- Verificar permissões atuais (queries para debug)
SELECT
  schemaname,
  tablename,
  tableowner,
  hasselect,
  hasinsert,
  hasupdate,
  hasdelete
FROM pg_tables
LEFT JOIN (
  SELECT
    schemaname as schema_name,
    tablename as table_name,
    has_table_privilege('postgres', schemaname||'.'||tablename, 'SELECT') as hasselect,
    has_table_privilege('postgres', schemaname||'.'||tablename, 'INSERT') as hasinsert,
    has_table_privilege('postgres', schemaname||'.'||tablename, 'UPDATE') as hasupdate,
    has_table_privilege('postgres', schemaname||'.'||tablename, 'DELETE') as hasdelete
  FROM pg_tables
  WHERE schemaname = 'intranet'
) perms ON pg_tables.schemaname = perms.schema_name AND pg_tables.tablename = perms.table_name
WHERE schemaname = 'intranet';