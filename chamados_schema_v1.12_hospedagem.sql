-- v1.12: Tabela de hospedagens vinculadas a grupos de contratos
-- Senha armazenada com criptografia AES reversível (admin pode visualizar)

CREATE TABLE IF NOT EXISTS intranet.hospedagem (
  id          SERIAL PRIMARY KEY,
  cod_grupo   INTEGER NOT NULL,
  nom_base    VARCHAR(100) NOT NULL,
  nom_host    VARCHAR(200) NOT NULL,
  nom_usuario VARCHAR(100),
  sen_senha   TEXT,          -- criptografada via AES-256
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospedagem_cod_grupo ON intranet.hospedagem(cod_grupo);
