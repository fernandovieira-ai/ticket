-- ============================================================
-- Migração v1.10 — Índices de performance para grupos
-- 01/04/2026
-- Corrige lentidão na listagem de grupos (/painel/whatsapp/grupos)
-- ============================================================

-- Suporta MAX(respondido_em) na LATERAL da listagem de grupos
-- (antes varria todas as linhas do grupo sem índice)
CREATE INDEX IF NOT EXISTS idx_wp_interacoes_grupo_respondido
  ON whatsapp_grupos_interacoes(grupo_id, respondido_em DESC NULLS FIRST);

-- Recria o índice parcial incluindo auto_resolvido = FALSE
-- (o índice anterior não batia com o filtro do COUNT, causando seq scan)
DROP INDEX IF EXISTS idx_wp_interacoes_grupo_aberto;
CREATE INDEX IF NOT EXISTS idx_wp_interacoes_grupo_aberto
  ON whatsapp_grupos_interacoes(grupo_id, msg_criada_em DESC)
  WHERE respondido_em IS NULL AND auto_resolvido = FALSE;
