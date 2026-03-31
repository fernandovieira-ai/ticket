-- ============================================================
-- Migração v1.8 — Monitoramento Automático de Grupos
-- 31/03/2026
-- Adiciona: colunas de auto-resolução em interações,
--           configurações de alerta em whatsapp_config
-- ============================================================

-- ------------------------------------------------------------
-- 1. AUTO-RESOLUÇÃO NAS INTERAÇÕES
-- Quando a IA detecta que o cliente resolveu o problema
-- sozinho, a interação é fechada sem contabilizar como
-- pendência para o atendimento.
-- ------------------------------------------------------------
ALTER TABLE whatsapp_grupos_interacoes
  ADD COLUMN IF NOT EXISTS auto_resolvido        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_resolvido_motivo TEXT,
  ADD COLUMN IF NOT EXISTS auto_resolvido_em     TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_grupos_interacoes.auto_resolvido
  IS 'TRUE quando a IA identificou que o próprio cliente resolveu o problema sem atendimento.';

COMMENT ON COLUMN whatsapp_grupos_interacoes.auto_resolvido_motivo
  IS 'Explicação gerada pela IA sobre por que o problema foi considerado resolvido.';

-- ------------------------------------------------------------
-- 2. CONFIGURAÇÕES DE ALERTA DE GRUPOS EM WHATSAPP_CONFIG
--
-- alerta_grupos_ativo    → liga/desliga o monitoramento
-- alerta_grupos_min      → minutos sem resposta para disparar alerta (padrão 30)
-- alerta_grupos_jid      → JID do grupo de suporte que receberá os alertas
--                          ex: "120363xxxxx@g.us"
-- alerta_grupos_usar_ia  → se TRUE, a IA analisa as mensagens antes de alertar
--                          para verificar se o cliente já resolveu o problema
-- ------------------------------------------------------------
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS alerta_grupos_ativo   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alerta_grupos_min     INTEGER     NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS alerta_grupos_jid     TEXT,
  ADD COLUMN IF NOT EXISTS alerta_grupos_usar_ia BOOLEAN     NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN whatsapp_config.alerta_grupos_ativo
  IS 'Habilita o monitoramento automático de grupos sem resposta.';

COMMENT ON COLUMN whatsapp_config.alerta_grupos_min
  IS 'Tempo em minutos sem resposta para considerar o grupo pendente e disparar alerta.';

COMMENT ON COLUMN whatsapp_config.alerta_grupos_jid
  IS 'JID do grupo WhatsApp de suporte que receberá as mensagens de alerta (ex: 120363xxxxx@g.us).';

COMMENT ON COLUMN whatsapp_config.alerta_grupos_usar_ia
  IS 'Se TRUE, a IA analisa as mensagens antes de alertar para verificar se o cliente já resolveu o problema sem atendimento.';
