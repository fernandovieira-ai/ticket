-- ============================================================
-- CONTROLE DE ACESSO POR TELA
-- ============================================================

-- Tabela para armazenar permissões de acesso por perfil e tela
CREATE TABLE IF NOT EXISTS permissoes_telas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  perfil          perfil_usuario NOT NULL,
  tela_rota       VARCHAR(200) NOT NULL,
  tela_nome       VARCHAR(200) NOT NULL,
  pode_acessar    BOOLEAN NOT NULL DEFAULT TRUE,
  pode_editar     BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, perfil, tela_rota)
);

CREATE INDEX idx_permissoes_telas_empresa ON permissoes_telas(empresa_id);
CREATE INDEX idx_permissoes_telas_perfil ON permissoes_telas(perfil);

CREATE TRIGGER trg_permissoes_telas_updated BEFORE UPDATE ON permissoes_telas
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- Inserir permissões padrão para todas as telas
-- Nota: Essas são permissões iniciais. Admin sempre tem acesso total.

-- Dashboard
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/dashboard', 'Dashboard', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/dashboard', 'Dashboard', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/dashboard', 'Dashboard', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/dashboard', 'Dashboard', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Tickets
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/tickets', 'Tickets', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/tickets', 'Tickets', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/tickets', 'Tickets', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/tickets', 'Tickets', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Solicitações
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/solicitacoes', 'Solicitações', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/solicitacoes', 'Solicitações', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/solicitacoes', 'Solicitações', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/solicitacoes', 'Solicitações', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Clientes
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/clientes', 'Clientes', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/clientes', 'Clientes', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/clientes', 'Clientes', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/clientes', 'Clientes', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- WhatsApp
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/whatsapp', 'WhatsApp', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/whatsapp', 'WhatsApp', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/whatsapp', 'WhatsApp', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/whatsapp', 'WhatsApp', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Intranet
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/intranet', 'Intranet', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/intranet', 'Intranet', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/intranet', 'Intranet', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/intranet', 'Intranet', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Relatórios
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/relatorios', 'Relatórios', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/relatorios', 'Relatórios', TRUE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/relatorios', 'Relatórios', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/relatorios', 'Relatórios', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Configurações
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/configuracoes', 'Configurações', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/configuracoes', 'Configurações', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'operador', '/painel/configuracoes', 'Configurações', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'somente_leitura', '/painel/configuracoes', 'Configurações', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;
