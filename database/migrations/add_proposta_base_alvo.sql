-- Rastreia em qual base (principal ou uma das bases adicionais do cliente) o sql_correcao
-- deve ser executado. Sem isso, /aplicar sempre assumia a base "principal", quebrando
-- qualquer correção cuja tabela viva numa base adicional (ex: "dunapetrol_emsys").
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS base_alvo VARCHAR(80) NOT NULL DEFAULT 'principal';
