-- ============================================================
-- Migração v1.7 — Controle de Tempo de Resposta em Grupos
-- 24/03/2026
-- Adiciona: quoted_* em whatsapp_grupos_mensagens,
--           tabela whatsapp_grupos_interacoes
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS DE CITAÇÃO/REPLY EM MENSAGENS DE GRUPO
-- Captura o contexto de resposta direta enviado pela
-- Evolution API (contextInfo.quotedMessage).
-- ------------------------------------------------------------
ALTER TABLE whatsapp_grupos_mensagens
  ADD COLUMN IF NOT EXISTS quoted_message_id    VARCHAR(100),  -- message_id da msg citada
  ADD COLUMN IF NOT EXISTS quoted_remetente_jid VARCHAR(100);  -- JID de quem escreveu a msg citada

CREATE INDEX IF NOT EXISTS idx_wp_gmsg_quoted
  ON whatsapp_grupos_mensagens(quoted_message_id)
  WHERE quoted_message_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. INTERAÇÕES DE ATENDIMENTO EM GRUPOS
--
-- Uma interação representa o ciclo:
--   mensagem de não-operador → primeira resposta de um operador
--
-- Como é identificada:
--   a) Se a mensagem do operador cita (reply) a msg do cliente
--      → vinculação direta por quoted_message_id
--   b) Caso contrário, a próxima mensagem de qualquer operador
--      no mesmo grupo após a msg do cliente fecha as interações
--      ainda em aberto (respondido_em IS NULL)
--
-- tempo_resposta_seg NULL → ainda aguardando resposta
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_grupos_interacoes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  grupo_id            UUID        NOT NULL REFERENCES whatsapp_grupos(id) ON DELETE CASCADE,

  -- Mensagem do cliente que gerou a interação
  msg_cliente_id      UUID        REFERENCES whatsapp_grupos_mensagens(id) ON DELETE SET NULL,
  remetente_jid       VARCHAR(100) NOT NULL,
  remetente_nome      VARCHAR(150),
  msg_criada_em       TIMESTAMPTZ NOT NULL,

  -- Primeira resposta de um operador
  msg_resposta_id     UUID        REFERENCES whatsapp_grupos_mensagens(id) ON DELETE SET NULL,
  operador_id         UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  respondido_em       TIMESTAMPTZ,

  -- Tempo calculado em segundos (NULL = sem resposta ainda)
  tempo_resposta_seg  INTEGER,

  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Busca eficiente de interações em aberto por grupo
CREATE INDEX IF NOT EXISTS idx_wp_interacoes_grupo_aberto
  ON whatsapp_grupos_interacoes(grupo_id, msg_criada_em DESC)
  WHERE respondido_em IS NULL;

-- Ranking de operadores por tempo de resposta
CREATE INDEX IF NOT EXISTS idx_wp_interacoes_operador
  ON whatsapp_grupos_interacoes(operador_id, respondido_em);

-- Monitoramento de interações sem resposta por empresa
CREATE INDEX IF NOT EXISTS idx_wp_interacoes_empresa_aberto
  ON whatsapp_grupos_interacoes(empresa_id, msg_criada_em DESC)
  WHERE respondido_em IS NULL;

-- ------------------------------------------------------------
-- 3. CONFIGURAÇÃO DE SLA PARA GRUPOS
-- Tempo máximo (em minutos) que uma mensagem pode ficar
-- sem resposta de um operador em cada grupo.
-- NULL = sem controle de SLA para aquele grupo.
-- ------------------------------------------------------------
ALTER TABLE whatsapp_grupos
  ADD COLUMN IF NOT EXISTS sla_resposta_min INTEGER DEFAULT NULL;

COMMENT ON COLUMN whatsapp_grupos.sla_resposta_min
  IS 'Tempo máximo em minutos para primeira resposta. NULL = sem SLA definido.';
