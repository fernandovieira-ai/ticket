-- Permite que uma regra aprendida guarde o SQL de correção já aprovado por um humano,
-- para reaplicação instantânea (sem chamada de IA) quando o MESMO erro exato reaparecer.
ALTER TABLE agente_regras
  ADD COLUMN IF NOT EXISTS sql_correcao TEXT,
  ADD COLUMN IF NOT EXISTS tipo         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nivel_risco  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS base_alvo    VARCHAR(80);
