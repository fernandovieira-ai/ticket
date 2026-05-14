-- Script para verificar usuário atual e permissões

-- 1. Verificar usuário conectado
SELECT current_user as usuario_atual, session_user as usuario_sessao;

-- 2. Verificar se o schema intranet existe e é acessível
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'intranet';

-- 3. Verificar permissões no schema intranet
SELECT
  has_schema_privilege(current_user, 'intranet', 'USAGE') as pode_usar_schema,
  has_schema_privilege(current_user, 'intranet', 'CREATE') as pode_criar_tabelas;

-- 4. Listar tabelas do schema intranet e permissões
SELECT
  table_name,
  has_table_privilege(current_user, 'intranet.' || table_name, 'SELECT') as pode_select,
  has_table_privilege(current_user, 'intranet.' || table_name, 'INSERT') as pode_insert,
  has_table_privilege(current_user, 'intranet.' || table_name, 'UPDATE') as pode_update,
  has_table_privilege(current_user, 'intranet.' || table_name, 'DELETE') as pode_delete
FROM information_schema.tables
WHERE table_schema = 'intranet'
ORDER BY table_name;

-- 5. Verificar owner das tabelas
SELECT
  t.table_name,
  t.table_schema,
  pg_get_userbyid(c.relowner) as table_owner
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE t.table_schema = 'intranet'
ORDER BY t.table_name;