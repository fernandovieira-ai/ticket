-- ============================================================
-- Migração v1.2 — Controle de Grupos WhatsApp
-- 21/03/2026
-- Adiciona: whatsapp_grupos, whatsapp_grupos_mensagens,
--           whatsapp_grupos_analises, relatorios_grupos
-- ============================================================

-- ------------------------------------------------------------
-- 1. GRUPOS WHATSAPP MONITORADOS
-- Cada grupo identificado na instância Evolution.
-- Só processa mensagens quando monitorado = TRUE.
-- ------------------------------------------------------------
CREATE TABLE whatsapp_grupos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  instancia_id    UUID NOT NULL REFERENCES whatsapp_instancias(id) ON DELETE CASCADE,
  group_jid       VARCHAR(100) NOT NULL,  -- ex: 120363xxxxx@g.us
  nome            VARCHAR(200) NOT NULL,
  descricao       TEXT,
  foto_url        TEXT,
  total_membros   INTEGER DEFAULT 0,
  monitorado      BOOLEAN NOT NULL DEFAULT FALSE,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  sincronizado_em TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instancia_id, group_jid)
);

CREATE INDEX idx_wp_grupos_empresa    ON whatsapp_grupos(empresa_id);
CREATE INDEX idx_wp_grupos_instancia  ON whatsapp_grupos(instancia_id);
CREATE INDEX idx_wp_grupos_monitorado ON whatsapp_grupos(empresa_id, monitorado);

CREATE TRIGGER trg_wp_grupos_updated BEFORE UPDATE ON whatsapp_grupos
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();

-- ------------------------------------------------------------
-- 2. MENSAGENS DOS GRUPOS
-- Armazena cada mensagem recebida de grupos monitorados.
-- Separada de whatsapp_mensagens (que é para tickets 1:1).
-- ------------------------------------------------------------
CREATE TABLE whatsapp_grupos_mensagens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  grupo_id       UUID NOT NULL REFERENCES whatsapp_grupos(id) ON DELETE CASCADE,
  message_id     VARCHAR(100),           -- ID da mensagem no Evolution API
  remetente_jid  VARCHAR(100) NOT NULL,  -- ex: 5511999xxxxx@s.whatsapp.net
  remetente_nome VARCHAR(150),
  tipo           VARCHAR(20) NOT NULL DEFAULT 'texto',  -- texto, imagem, audio, video, documento, sticker
  conteudo       TEXT,
  midia_url      TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wp_gmsg_grupo   ON whatsapp_grupos_mensagens(grupo_id, criado_em DESC);
CREATE INDEX idx_wp_gmsg_empresa ON whatsapp_grupos_mensagens(empresa_id, criado_em DESC);
CREATE INDEX idx_wp_gmsg_rem     ON whatsapp_grupos_mensagens(remetente_jid);

-- ------------------------------------------------------------
-- 3. ANÁLISES IA DOS GRUPOS
-- Resultado de análise batch da IA para um grupo em um período.
-- Pode ser gerada sob demanda ou por agendamento.
--
-- topicos: [{ "titulo": "...", "relevancia": 0.9 }, ...]
-- participantes_ativos: [{ "jid": "...", "nome": "...", "total": 12 }, ...]
-- alertas: [{ "tipo": "linguagem_ofensiva", "descricao": "...", "mensagem_id": "..." }, ...]
-- ------------------------------------------------------------
CREATE TABLE whatsapp_grupos_analises (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  grupo_id             UUID NOT NULL REFERENCES whatsapp_grupos(id) ON DELETE CASCADE,
  periodo_inicio       TIMESTAMPTZ NOT NULL,
  periodo_fim          TIMESTAMPTZ NOT NULL,
  total_mensagens      INTEGER NOT NULL DEFAULT 0,
  total_participantes  INTEGER NOT NULL DEFAULT 0,
  resumo               TEXT,
  sentimento           VARCHAR(20) CHECK (sentimento IN ('positivo','neutro','negativo','misto')),
  score_sentimento     NUMERIC(3,2),   -- -1.0 (muito negativo) a 1.0 (muito positivo)
  topicos              JSONB,
  participantes_ativos JSONB,
  alertas              JSONB,
  tokens_entrada       INTEGER,
  tokens_saida         INTEGER,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wp_ganalises_grupo   ON whatsapp_grupos_analises(grupo_id, criado_em DESC);
CREATE INDEX idx_wp_ganalises_empresa ON whatsapp_grupos_analises(empresa_id, criado_em DESC);

-- ------------------------------------------------------------
-- 4. RELATÓRIOS DE GRUPOS
-- Relatórios gerados (on-demand ou agendados).
-- grupo_id NULL = relatório consolidado de todos os grupos.
--
-- tipo: analise_periodo | resumo_diario | resumo_semanal | alertas
-- formato: json | pdf | csv
-- status: processando | concluido | erro
-- ------------------------------------------------------------
CREATE TABLE relatorios_grupos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  grupo_id       UUID REFERENCES whatsapp_grupos(id) ON DELETE SET NULL,
  titulo         VARCHAR(200) NOT NULL,
  tipo           VARCHAR(40) NOT NULL DEFAULT 'analise_periodo',
  formato        VARCHAR(10) NOT NULL DEFAULT 'json' CHECK (formato IN ('json','pdf','csv')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim    TIMESTAMPTZ NOT NULL,
  parametros     JSONB,
  conteudo       JSONB,
  url_arquivo    TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'processando' CHECK (status IN ('processando','concluido','erro')),
  erro           TEXT,
  gerado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_relatorios_grupos_empresa ON relatorios_grupos(empresa_id, criado_em DESC);
CREATE INDEX idx_relatorios_grupos_grupo   ON relatorios_grupos(grupo_id);
CREATE INDEX idx_relatorios_grupos_status  ON relatorios_grupos(status);

CREATE TRIGGER trg_relatorios_grupos_updated BEFORE UPDATE ON relatorios_grupos
  FOR EACH ROW EXECUTE FUNCTION fn_set_atualizado_em();
