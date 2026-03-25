-- ============================================================
-- PLATAFORMA DE CHAMADOS & TICKETS
-- Schema PostgreSQL — v1.1 | 16/03/2026
-- Alteração v1.1: status_ticket, prioridade_ticket e
-- tipo_solicitacao_interna convertidos de ENUM para tabelas
-- ============================================================

-- Extensões
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- não disponível neste servidor; usando gen_random_uuid() nativo
-- CREATE EXTENSION IF NOT EXISTS "unaccent";   -- não disponível neste servidor
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- não disponível neste servidor

-- ============================================================
-- ENUMS FIXOS (não editáveis pelo admin — são estruturais)
-- ============================================================

CREATE TYPE perfil_usuario AS ENUM (
  'admin',
  'supervisor',
  'operador',
  'cliente',
  'somente_leitura'
);

CREATE TYPE status_notificacao AS ENUM (
  'pendente',
  'enviada',
  'falha'
);

CREATE TYPE canal_notificacao AS ENUM (
  'email',
  'painel',
  'ambos'
);

CREATE TYPE tipo_campo_extra AS ENUM (
  'texto',
  'numero',
  'data',
  'select',
  'booleano'
);

CREATE TYPE status_solicitacao AS ENUM (
  'aberta',
  'em_andamento',
  'aguardando',
  'concluida',
  'cancelada'
);

CREATE TYPE visibilidade_artigo AS ENUM (
  'publico',
  'interno'
);

-- ============================================================
-- TABELAS DE CADASTRO (editáveis pelo admin)
-- ============================================================

-- ------------------------------------------------------------
-- 1. STATUS DE TICKET
-- Substitui: CREATE TYPE status_ticket AS ENUM (...)
-- ------------------------------------------------------------
CREATE TABLE ticket_status (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID,                     -- NULL = padrão global; UUID = sobrescreve por empresa
  codigo        VARCHAR(40) NOT NULL,     -- chave interna: 'aberto', 'em_andamento'...
  nome          VARCHAR(80) NOT NULL,     -- label exibido: 'Aberto', 'Em Andamento'...
  descricao     TEXT,
  cor           VARCHAR(7) DEFAULT '#6B7280',  -- hex para badge colorido na UI
  icone         VARCHAR(50),             -- nome do ícone lucide-react, ex: 'circle', 'clock'
  ordem         SMALLINT NOT NULL DEFAULT 0,
  -- Comportamento do status
  pausa_sla     BOOLEAN NOT NULL DEFAULT FALSE,  -- pausa contador de SLA?
  encerra       BOOLEAN NOT NULL DEFAULT FALSE,  -- é um status final (fecha ticket)?
  permite_reabrir BOOLEAN NOT NULL DEFAULT FALSE,
  -- Controle
  sistema       BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = não pode excluir (status nativo)
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_ticket_status_empresa ON ticket_status(empresa_id);
CREATE INDEX idx_ticket_status_ordem   ON ticket_status(ordem);

-- ------------------------------------------------------------
-- 2. PRIORIDADES DE TICKET
-- Substitui: CREATE TYPE prioridade_ticket AS ENUM (...)
-- ------------------------------------------------------------
CREATE TABLE ticket_prioridades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID,                     -- NULL = padrão global
  codigo        VARCHAR(40) NOT NULL,     -- 'baixa', 'normal', 'alta', 'urgente'
  nome          VARCHAR(80) NOT NULL,     -- 'Baixa', 'Normal', 'Alta', 'Urgente'
  descricao     TEXT,
  cor           VARCHAR(7) DEFAULT '#6B7280',
  icone         VARCHAR(50),
  ordem         SMALLINT NOT NULL DEFAULT 0,   -- define nível (0 = mais baixo)
  -- SLA padrão para esta prioridade (pode ser sobreposto por categoria)
  sla_primeira_resposta INTERVAL NOT NULL DEFAULT '8 hours',
  sla_resolucao         INTERVAL NOT NULL DEFAULT '24 hours',
  sla_alerta_pct        SMALLINT NOT NULL DEFAULT 70,
  -- Controle
  sistema       BOOLEAN NOT NULL DEFAULT FALSE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_ticket_prioridades_empresa ON ticket_prioridades(empresa_id);
CREATE INDEX idx_ticket_prioridades_ordem   ON ticket_prioridades(ordem);

-- ------------------------------------------------------------
-- 3. TIPOS DE SOLICITAÇÃO INTERNA
-- Substitui: CREATE TYPE tipo_solicitacao_interna AS ENUM (...)
-- ------------------------------------------------------------
CREATE TABLE solicitacao_tipos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID,
  codigo        VARCHAR(60) NOT NULL,
  nome          VARCHAR(100) NOT NULL,
  descricao     TEXT,
  icone         VARCHAR(50),
  cor           VARCHAR(7) DEFAULT '#6B7280',
  -- Campos extras específicos desse tipo (JSON schema simplificado)
  campos_extras JSONB,
  ordem         SMALLINT NOT NULL DEFAULT 0,
  sistema       BOOLEAN NOT NULL DEFAULT FALSE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_solicitacao_tipos_empresa ON solicitacao_tipos(empresa_id);

-- ============================================================
-- TRIGGER updated_at para tabelas de cadastro
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_status_updated
  BEFORE UPDATE ON ticket_status
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_ticket_prioridades_updated
  BEFORE UPDATE ON ticket_prioridades
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TRIGGER trg_solicitacao_tipos_updated
  BEFORE UPDATE ON solicitacao_tipos
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- ============================================================
-- SEED — Valores padrão globais (empresa_id = NULL)
-- ============================================================

-- Status de ticket (sistema = TRUE → não excluíveis)
INSERT INTO ticket_status
  (empresa_id, codigo, nome, descricao, cor, icone, ordem, pausa_sla, encerra, permite_reabrir, sistema)
VALUES
  (NULL, 'aberto',             'Aberto',              'Ticket recém-criado, aguardando atribuição',       '#3B82F6', 'circle',         0, FALSE, FALSE, FALSE, TRUE),
  (NULL, 'em_andamento',       'Em Andamento',        'Atribuído a um agente, em atendimento',            '#F59E0B', 'clock',          1, FALSE, FALSE, FALSE, TRUE),
  (NULL, 'aguardando_cliente', 'Aguardando Cliente',  'Resposta enviada, aguardando retorno do cliente',  '#8B5CF6', 'hourglass',      2, TRUE,  FALSE, FALSE, TRUE),
  (NULL, 'resolvido',          'Resolvido',           'Solução aplicada, aguardando confirmação',         '#10B981', 'check-circle',   3, FALSE, FALSE, TRUE,  TRUE),
  (NULL, 'fechado',            'Fechado',             'Encerrado definitivamente',                        '#6B7280', 'x-circle',       4, FALSE, TRUE,  FALSE, TRUE),
  (NULL, 'cancelado',          'Cancelado',           'Cancelado pelo cliente ou operador',               '#EF4444', 'ban',            5, FALSE, TRUE,  FALSE, TRUE);

-- Prioridades de ticket
INSERT INTO ticket_prioridades
  (empresa_id, codigo, nome, descricao, cor, icone, ordem, sla_primeira_resposta, sla_resolucao, sla_alerta_pct, sistema)
VALUES
  (NULL, 'baixa',   'Baixa',   'Sem impacto imediato na operação',         '#6B7280', 'arrow-down',    0, '24 hours',  '72 hours', 70, TRUE),
  (NULL, 'normal',  'Normal',  'Impacto moderado, atendimento regular',    '#3B82F6', 'minus',         1, '8 hours',   '24 hours', 70, TRUE),
  (NULL, 'alta',    'Alta',    'Impacto significativo, requer atenção',    '#F59E0B', 'arrow-up',      2, '2 hours',   '8 hours',  70, TRUE),
  (NULL, 'urgente', 'Urgente', 'Sistema parado ou impacto crítico',        '#EF4444', 'alert-triangle',3, '30 minutes','4 hours',  70, TRUE);

-- Tipos de solicitação interna
INSERT INTO solicitacao_tipos
  (empresa_id, codigo, nome, descricao, icone, ordem, sistema)
VALUES
  (NULL, 'informacao',            'Informação',           'Solicitar relatório, dado ou documento a outro setor', 'file-text',  0, TRUE),
  (NULL, 'servico',               'Serviço',              'Solicitar execução de tarefa por outro departamento',  'wrench',     1, TRUE),
  (NULL, 'suporte_interno',       'Suporte Interno',      'Relatar problema com sistema ou equipamento interno',  'headphones', 2, TRUE),
  (NULL, 'formulario_customizado','Formulário Customizado','Reembolso, passagem, requisição administrativa',       'layout',     3, TRUE);

-- ============================================================
-- EMPRESAS / TENANTS
-- ============================================================

CREATE TABLE empresas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(200) NOT NULL,
  dominio         VARCHAR(100),
  logo_url        TEXT,
  fuso_horario    VARCHAR(50)  NOT NULL DEFAULT 'America/Sao_Paulo',
  idioma          VARCHAR(10)  NOT NULL DEFAULT 'pt-BR',
  prefixo_ticket  VARCHAR(10)  NOT NULL DEFAULT 'TK',
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- ============================================================
-- DEPARTAMENTOS
-- ============================================================

CREATE TABLE departamentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- USUÁRIOS
-- ============================================================

CREATE TABLE usuarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  departamento_id   UUID REFERENCES departamentos(id) ON DELETE SET NULL,
  nome              VARCHAR(150) NOT NULL,
  email             VARCHAR(200) NOT NULL,
  password_hash     TEXT,
  perfil            perfil_usuario NOT NULL DEFAULT 'cliente',
  avatar_url        TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  tentativas_login  SMALLINT NOT NULL DEFAULT 0,
  bloqueado_ate     TIMESTAMPTZ,
  ultimo_acesso     TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, email)
);

CREATE INDEX idx_usuarios_email   ON usuarios(email);
CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);

CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- ============================================================
-- LOG DE ACESSOS
-- ============================================================

CREATE TABLE log_acessos (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ip          VARCHAR(45),
  user_agent  TEXT,
  sucesso     BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_log_acessos_usuario ON log_acessos(usuario_id);

-- ============================================================
-- CLIENTES (CRM)
-- ============================================================

CREATE TABLE clientes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_razao    VARCHAR(200) NOT NULL,
  documento     VARCHAR(20),
  email         VARCHAR(200),
  telefone      VARCHAR(30),
  segmento      VARCHAR(100),
  endereco      JSONB,
  observacoes   TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clientes_empresa      ON clientes(empresa_id);
CREATE INDEX idx_clientes_documento    ON clientes(documento);
-- CREATE INDEX idx_clientes_nome_trgm    ON clientes USING GIN (nome_razao gin_trgm_ops);  -- requer pg_trgm

CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TABLE contatos_cliente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome        VARCHAR(150) NOT NULL,
  cargo       VARCHAR(100),
  email       VARCHAR(200),
  telefone    VARCHAR(30),
  principal   BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE campos_extras_cliente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  tipo        tipo_campo_extra NOT NULL DEFAULT 'texto',
  obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  opcoes      JSONB,
  ordem       SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE valores_campos_cliente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  campo_id    UUID NOT NULL REFERENCES campos_extras_cliente(id) ON DELETE CASCADE,
  valor       TEXT,
  UNIQUE(cliente_id, campo_id)
);

CREATE TABLE inventario_cliente (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  produto       VARCHAR(200) NOT NULL,
  numero_serie  VARCHAR(100),
  status        VARCHAR(50),
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CATEGORIAS DE TICKET
-- ============================================================

CREATE TABLE categorias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES categorias(id) ON DELETE SET NULL,
  nome              VARCHAR(100) NOT NULL,
  descricao         TEXT,
  sla_primeira_resp INTERVAL,
  sla_resolucao     INTERVAL,
  visivel_cliente   BOOLEAN NOT NULL DEFAULT TRUE,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  ordem             SMALLINT NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categorias_empresa ON categorias(empresa_id);
CREATE INDEX idx_categorias_parent  ON categorias(parent_id);



-- ============================================================
-- DEPARTAMENTOS
-- ============================================================

create table cadegoria_departamento (id uuid, categoria_id uuid NOT NULL , departamento_id uuid NOT NULL,
                                    CONSTRAINT cadegoria_departamento_peky PRIMARY KEY (id));



-- ============================================================
-- HORÁRIO COMERCIAL (para cálculo de SLA)
-- ============================================================

CREATE TABLE horario_comercial (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  dia_semana  SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fim    TIME NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- TICKETS
-- Referencia ticket_status e ticket_prioridades pelo UUID
-- ============================================================

CREATE TABLE tickets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero                      VARCHAR(20) NOT NULL,
  titulo                      VARCHAR(120) NOT NULL,
  descricao                   TEXT NOT NULL,
  -- FK para tabelas de cadastro (substituindo ENUMs)
  status_id                   UUID NOT NULL REFERENCES ticket_status(id),
  prioridade_id               UUID NOT NULL REFERENCES ticket_prioridades(id),
  categoria_id                UUID REFERENCES categorias(id) ON DELETE SET NULL,
  subcategoria_id             UUID REFERENCES categorias(id) ON DELETE SET NULL,
  cliente_id                  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  aberto_por                  UUID NOT NULL REFERENCES usuarios(id),
  atribuido_a                 UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  departamento_id             UUID REFERENCES departamentos(id) ON DELETE SET NULL,
  canal                       VARCHAR(20) NOT NULL DEFAULT 'portal',
  -- SLA
  sla_primeira_resp_deadline  TIMESTAMPTZ,
  sla_resolucao_deadline      TIMESTAMPTZ,
  sla_pausado_em              TIMESTAMPTZ,
  sla_primeira_resp_ok        BOOLEAN,
  sla_resolucao_ok            BOOLEAN,
  -- Datas ciclo de vida
  respondido_em               TIMESTAMPTZ,
  resolvido_em                TIMESTAMPTZ,
  fechado_em                  TIMESTAMPTZ,
  reaberto_em                 TIMESTAMPTZ,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, numero)
);

CREATE INDEX idx_tickets_empresa        ON tickets(empresa_id);
CREATE INDEX idx_tickets_status         ON tickets(status_id);
CREATE INDEX idx_tickets_prioridade     ON tickets(prioridade_id);
CREATE INDEX idx_tickets_cliente        ON tickets(cliente_id);
CREATE INDEX idx_tickets_atribuido      ON tickets(atribuido_a);
CREATE INDEX idx_tickets_criado         ON tickets(criado_em DESC);
CREATE INDEX idx_tickets_atualizado     ON tickets(atualizado_em DESC);  -- ORDER BY principal da listagem
CREATE INDEX idx_tickets_numero         ON tickets(numero);
-- Índice composto para acelerar listagem paginada por empresa (evita sort adicional)
CREATE INDEX idx_tickets_empresa_atualizado ON tickets(empresa_id, atualizado_em DESC);
-- Index parcial simplificado (subquery não é permitida em predicado de index no PG)
CREATE INDEX idx_tickets_sla ON tickets(sla_resolucao_deadline)
  WHERE sla_resolucao_deadline IS NOT NULL;

CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TABLE campos_extras_ticket (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  tipo        tipo_campo_extra NOT NULL DEFAULT 'texto',
  obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  opcoes      JSONB,
  ordem       SMALLINT NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE valores_campos_ticket (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  campo_id    UUID NOT NULL REFERENCES campos_extras_ticket(id) ON DELETE CASCADE,
  valor       TEXT,
  UNIQUE(ticket_id, campo_id)
);

CREATE TABLE anexos_ticket (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  nome        VARCHAR(255) NOT NULL,
  url         TEXT NOT NULL,
  tamanho     INTEGER,
  mime_type   VARCHAR(100),
  enviado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MENSAGENS
-- ============================================================

CREATE TABLE mensagens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor_id    UUID NOT NULL REFERENCES usuarios(id),
  corpo       TEXT NOT NULL,
  interna     BOOLEAN NOT NULL DEFAULT FALSE,
  lido_em     TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mensagens_ticket ON mensagens(ticket_id);
CREATE INDEX idx_mensagens_autor  ON mensagens(autor_id);

CREATE TABLE anexos_mensagem (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
  nome        VARCHAR(255) NOT NULL,
  url         TEXT NOT NULL,
  tamanho     INTEGER,
  mime_type   VARCHAR(100)
);

-- ============================================================
-- SLA LOG
-- ============================================================

CREATE TABLE sla_logs (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  evento        VARCHAR(50) NOT NULL,
  tipo          VARCHAR(30),
  deadline      TIMESTAMPTZ,
  violado       BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sla_logs_ticket ON sla_logs(ticket_id);

-- ============================================================
-- PESQUISA DE SATISFAÇÃO
-- ============================================================

CREATE TABLE pesquisa_satisfacao (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  nota          SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario    TEXT,
  respondido    BOOLEAN NOT NULL DEFAULT FALSE,
  enviado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  respondido_em TIMESTAMPTZ
);

-- ============================================================
-- SOLICITAÇÕES INTERNAS
-- Usa solicitacao_tipos (tabela) em vez do ENUM
-- ============================================================

CREATE TABLE solicitacoes_internas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_id           UUID NOT NULL REFERENCES solicitacao_tipos(id),
  titulo            VARCHAR(200) NOT NULL,
  descricao         TEXT,
  status            status_solicitacao NOT NULL DEFAULT 'aberta',
  prioridade_id     UUID REFERENCES ticket_prioridades(id),
  solicitante_id    UUID NOT NULL REFERENCES usuarios(id),
  departamento_dest UUID REFERENCES departamentos(id) ON DELETE SET NULL,
  responsavel_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  prazo             DATE,
  fechado_em        TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_solic_empresa     ON solicitacoes_internas(empresa_id);
CREATE INDEX idx_solic_solicitante ON solicitacoes_internas(solicitante_id);
CREATE INDEX idx_solic_responsavel ON solicitacoes_internas(responsavel_id);

CREATE TRIGGER trg_solicitacoes_updated BEFORE UPDATE ON solicitacoes_internas
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

CREATE TABLE mensagens_solicitacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  UUID NOT NULL REFERENCES solicitacoes_internas(id) ON DELETE CASCADE,
  autor_id        UUID NOT NULL REFERENCES usuarios(id),
  corpo           TEXT NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE anexos_solicitacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  UUID NOT NULL REFERENCES solicitacoes_internas(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL,
  url             TEXT NOT NULL,
  tamanho         INTEGER,
  mime_type       VARCHAR(100)
);

-- ============================================================
-- BASE DE CONHECIMENTO
-- ============================================================

CREATE TABLE kb_categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES kb_categorias(id) ON DELETE SET NULL,
  nome        VARCHAR(100) NOT NULL,
  ordem       SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE kb_artigos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id  UUID REFERENCES kb_categorias(id) ON DELETE SET NULL,
  titulo        VARCHAR(200) NOT NULL,
  conteudo      TEXT NOT NULL,
  visibilidade  visibilidade_artigo NOT NULL DEFAULT 'publico',
  publicado     BOOLEAN NOT NULL DEFAULT FALSE,
  autor_id      UUID NOT NULL REFERENCES usuarios(id),
  visualizacoes INTEGER NOT NULL DEFAULT 0,
  uteis         INTEGER NOT NULL DEFAULT 0,
  nao_uteis     INTEGER NOT NULL DEFAULT 0,
  publicado_em  TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_artigos_empresa  ON kb_artigos(empresa_id);
-- CREATE INDEX idx_kb_titulo_trgm      ON kb_artigos USING GIN (titulo gin_trgm_ops);  -- requer pg_trgm
CREATE INDEX idx_kb_conteudo_fts     ON kb_artigos USING GIN (to_tsvector('portuguese', conteudo));

CREATE TRIGGER trg_kb_artigos_updated BEFORE UPDATE ON kb_artigos
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================

CREATE TABLE notificacoes (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        VARCHAR(60) NOT NULL,
  titulo      VARCHAR(200),
  payload     JSONB,
  canal       canal_notificacao NOT NULL DEFAULT 'ambos',
  lida        BOOLEAN NOT NULL DEFAULT FALSE,
  status      status_notificacao NOT NULL DEFAULT 'pendente',
  lida_em     TIMESTAMPTZ,
  enviada_em  TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_usuario  ON notificacoes(usuario_id, lida);
CREATE INDEX idx_notif_empresa  ON notificacoes(empresa_id);

CREATE TABLE email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo        VARCHAR(60) NOT NULL,
  assunto     VARCHAR(255) NOT NULL,
  corpo_html  TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(empresa_id, tipo)
);

-- ============================================================
-- REGRAS DE ATRIBUIÇÃO
-- ============================================================

CREATE TABLE regras_atribuicao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome            VARCHAR(100) NOT NULL,
  categoria_id    UUID REFERENCES categorias(id) ON DELETE CASCADE,
  departamento_id UUID REFERENCES departamentos(id) ON DELETE CASCADE,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'round_robin',
  atribuir_a      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  ordem           SMALLINT NOT NULL DEFAULT 0
);

-- ============================================================
-- WHATSAPP
-- ============================================================

CREATE TABLE whatsapp_instancias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome_instancia  VARCHAR(100) NOT NULL,
  numero          VARCHAR(20),
  provider        VARCHAR(20) NOT NULL DEFAULT 'evolution',
  status          VARCHAR(20) NOT NULL DEFAULT 'desconectado',
  qr_code         TEXT,
  webhook_secret  VARCHAR(100),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, nome_instancia)
);

CREATE TABLE whatsapp_contatos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  numero      VARCHAR(20) NOT NULL,
  nome        VARCHAR(150),
  avatar_url  TEXT,
  ultimo_msg  TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, numero)
);

CREATE INDEX idx_wp_contatos_empresa ON whatsapp_contatos(empresa_id);
CREATE INDEX idx_wp_contatos_cliente ON whatsapp_contatos(cliente_id);

CREATE TABLE whatsapp_mensagens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ticket_id       UUID REFERENCES tickets(id) ON DELETE SET NULL,
  contato_id      UUID REFERENCES whatsapp_contatos(id) ON DELETE SET NULL,
  message_id      VARCHAR(100),
  direcao         VARCHAR(10) NOT NULL CHECK (direcao IN ('entrada','saida')),
  tipo            VARCHAR(20) NOT NULL DEFAULT 'texto',
  corpo           TEXT,
  midia_url       TEXT,
  status          VARCHAR(20) DEFAULT 'recebida',
  enviada_por_ia  BOOLEAN NOT NULL DEFAULT FALSE,
  agente_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wp_mensagens_ticket  ON whatsapp_mensagens(ticket_id);
CREATE INDEX idx_wp_mensagens_contato ON whatsapp_mensagens(contato_id);
CREATE INDEX idx_wp_mensagens_empresa ON whatsapp_mensagens(empresa_id, criado_em DESC);

CREATE TABLE whatsapp_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  horario_bot_inicio    TIME DEFAULT '08:00',
  horario_bot_fim       TIME DEFAULT '18:00',
  msg_boas_vindas       TEXT DEFAULT 'Olá! Seja bem-vindo ao suporte. Como posso ajudar?',
  msg_fora_horario      TEXT DEFAULT 'Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Retornaremos em breve.',
  msg_ticket_criado     TEXT DEFAULT 'Ticket *#{{numero}}* criado! Acompanhe pelo portal.',
  msg_ticket_respondido TEXT DEFAULT 'Seu ticket *#{{numero}}* recebeu uma resposta.',
  ia_ativa              BOOLEAN NOT NULL DEFAULT FALSE,
  ia_modo               VARCHAR(20) DEFAULT 'sugestao',
  ia_confianca_min      NUMERIC(3,2) DEFAULT 0.75,
  ia_prompt_sistema     TEXT,
  criar_ticket_auto     BOOLEAN NOT NULL DEFAULT TRUE,
  categoria_padrao_id   UUID REFERENCES categorias(id) ON DELETE SET NULL,
  UNIQUE(empresa_id)
);

-- ============================================================
-- IA
-- ============================================================

CREATE TABLE ia_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modelo              VARCHAR(60) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  max_tokens          INTEGER NOT NULL DEFAULT 1024,
  prompt_sugestao     TEXT,
  prompt_classificar  TEXT,
  prompt_resumir      TEXT,
  prompt_whatsapp_bot TEXT,
  limite_diario       INTEGER DEFAULT 500,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(empresa_id)
);

CREATE TABLE ia_logs (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ticket_id       UUID REFERENCES tickets(id) ON DELETE SET NULL,
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo            VARCHAR(40) NOT NULL,
  prompt_resumido TEXT,
  resposta        TEXT,
  tokens_entrada  INTEGER,
  tokens_saida    INTEGER,
  latencia_ms     INTEGER,
  confianca       NUMERIC(3,2),
  usado           BOOLEAN DEFAULT FALSE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ia_logs_ticket  ON ia_logs(ticket_id);
CREATE INDEX idx_ia_logs_empresa ON ia_logs(empresa_id, criado_em DESC);

-- ============================================================
-- FUNÇÃO — Gera número sequencial do ticket
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gerar_numero_ticket(p_empresa_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  v_prefixo VARCHAR(10);
  v_seq     BIGINT;
BEGIN
  SELECT prefixo_ticket INTO v_prefixo FROM empresas WHERE id = p_empresa_id;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 2) AS BIGINT)), 0) + 1
    INTO v_seq FROM tickets WHERE empresa_id = p_empresa_id;
  RETURN v_prefixo || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEED — Dados iniciais da empresa
-- ============================================================

INSERT INTO empresas (id, nome, dominio, prefixo_ticket)
VALUES ('00000000-0000-0000-0000-000000000001', 'DigitalRF', 'digitalrf.com.br', 'TK');

INSERT INTO horario_comercial (empresa_id, dia_semana, hora_inicio, hora_fim) VALUES
('00000000-0000-0000-0000-000000000001', 1, '08:00', '18:00'),
('00000000-0000-0000-0000-000000000001', 2, '08:00', '18:00'),
('00000000-0000-0000-0000-000000000001', 3, '08:00', '18:00'),
('00000000-0000-0000-0000-000000000001', 4, '08:00', '18:00'),
('00000000-0000-0000-0000-000000000001', 5, '08:00', '18:00');

INSERT INTO usuarios (id, empresa_id, nome, email, perfil)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Administrador', 'admin@digitalrf.com.br', 'admin');

INSERT INTO categorias (empresa_id, nome, descricao) VALUES
('00000000-0000-0000-0000-000000000001', 'Suporte Técnico', 'Problemas técnicos e sistemas'),
('00000000-0000-0000-0000-000000000001', 'Comercial',       'Dúvidas e solicitações comerciais'),
('00000000-0000-0000-0000-000000000001', 'Financeiro',      'Cobranças, notas e pagamentos'),
('00000000-0000-0000-0000-000000000001', 'Outros',          'Demais assuntos');

INSERT INTO whatsapp_config (empresa_id)
VALUES ('00000000-0000-0000-0000-000000000001');

INSERT INTO ia_config (empresa_id)
VALUES ('00000000-0000-0000-0000-000000000001');

-- ============================================================
-- Migração v1.2 — Auto-cadastro portal do cliente
-- ============================================================

-- Coluna para identificar clientes criados via auto-cadastro sem CNPJ (pré-cadastro)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ind_pre_cadastro bool DEFAULT false NOT NULL;
