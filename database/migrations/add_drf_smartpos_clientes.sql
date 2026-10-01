-- Cadastro de clientes para licenciamento do app Smart POS
-- Executar em: drfticket (schema public)

CREATE TABLE IF NOT EXISTS drf_smartpos_clientes (
    id            SERIAL PRIMARY KEY,
    cnpj          VARCHAR(18) NOT NULL,
    nome_cliente  VARCHAR(255) NOT NULL,
    ind_ativo     BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (cnpj)
);

CREATE INDEX IF NOT EXISTS idx_smartpos_clientes_ativo ON drf_smartpos_clientes(ind_ativo);
