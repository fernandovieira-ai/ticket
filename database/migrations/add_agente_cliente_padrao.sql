-- Padrões salvos por cliente (base) para os ajustes determinísticos do Painel de Erros — pra não perguntar
-- de novo toda vez (ex.: qual tipo de movimento usar na entrada de estoque, qual forma de pagamento usar
-- no ajuste de adiantamento). Uma tabela GENÉRICA (chave + valor em JSONB) em vez de uma tabela por tipo de
-- ajuste: cada ajuste novo só precisa de uma `chave` nova em código (agents/core/padroes-cliente.ts), nunca
-- de uma migration nova. É por CLIENTE, nunca só por empresa_id: os candidatos (tipo de movimento, forma de
-- pagamento) vêm do catálogo do EMSys3 de CADA cliente — o mesmo `id` não tem relação entre clientes
-- diferentes.

CREATE TABLE IF NOT EXISTS agente_cliente_padrao (
  empresa_id     UUID NOT NULL,
  cliente_id     UUID NOT NULL,
  chave          TEXT NOT NULL,
  valor          JSONB NOT NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, cliente_id, chave)
);
