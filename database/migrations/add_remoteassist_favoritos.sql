-- ============================================================
-- Favoritos (ID + senha salvos) do Remote Assist DRF, sincronizados
-- entre maquinas do mesmo usuario via digitalrf-help.
-- Executar em: digitalrf-help (drfticket)
-- Cada linha = um favorito (device_id de quem ele conectou), com
-- "seq" crescente por escrita para sincronizacao incremental (since=seq).
-- Consultado/gravado pelo app (edicao completa) via
-- GET/PUT /api/remoteassist/favoritos (x-relay-secret).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS remoteassist_favoritos_seq;

CREATE TABLE IF NOT EXISTS remoteassist_favoritos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id varchar(9) NOT NULL UNIQUE,
    senha text,
    apelido varchar(200),
    seq bigint NOT NULL,
    removido boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remoteassist_favoritos_seq_idx ON remoteassist_favoritos (seq);
