-- ============================================================
-- Migração v1.4 — Telefone WhatsApp no Usuário
-- 21/03/2026
-- Adiciona campo telefone_whatsapp em usuarios para
-- vincular mensagens de grupos ao operador responsável.
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);

-- JID do WhatsApp do usuário (ex: 263689584308313@lid ou 5511999990000@s.whatsapp.net)
-- Usado para vincular mensagens de grupos ao operador.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS whatsapp_jid VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp_jid
  ON usuarios(empresa_id, whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;
