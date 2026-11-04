-- ============================================================
-- Grupos de favoritos do Remote Assist DRF (agrupar favoritos por rede/cliente).
-- Executar em: digitalrf-help (drfticket)
-- ============================================================

ALTER TABLE remoteassist_favoritos ADD COLUMN IF NOT EXISTS grupo varchar(200);

CREATE SEQUENCE IF NOT EXISTS remoteassist_favoritos_grupos_seq;

CREATE TABLE IF NOT EXISTS remoteassist_favoritos_grupos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome varchar(200) NOT NULL UNIQUE,
    seq bigint NOT NULL,
    removido boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remoteassist_favoritos_grupos_seq_idx ON remoteassist_favoritos_grupos (seq);

INSERT INTO remoteassist_favoritos_grupos (nome, seq) VALUES
    ('REDE TELES',           nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE ALEX',            nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE SORRISO',         nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE PMG',             nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE TOMIASI',         nextval('remoteassist_favoritos_grupos_seq')),
    ('GRUPO REI DA CASTELO', nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE ALIANÇA',         nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE 3000',            nextval('remoteassist_favoritos_grupos_seq')),
    ('GRUPO Z+Z',            nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE DUQUE',           nextval('remoteassist_favoritos_grupos_seq')),
    ('GRUPO BAGATTOLI',      nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE VTG',             nextval('remoteassist_favoritos_grupos_seq')),
    ('AUTO POSTO 9',         nextval('remoteassist_favoritos_grupos_seq')),
    ('PORTELA',              nextval('remoteassist_favoritos_grupos_seq')),
    ('POSTO NAVES',          nextval('remoteassist_favoritos_grupos_seq')),
    ('POSTO BV',             nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE COTRAR',          nextval('remoteassist_favoritos_grupos_seq')),
    ('POSTO DCK',            nextval('remoteassist_favoritos_grupos_seq')),
    ('REDE RECOPEL',         nextval('remoteassist_favoritos_grupos_seq'))
ON CONFLICT (nome) DO NOTHING;
