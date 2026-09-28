-- Vínculo obrigatório AS (base principal) x EMSys3 (base adicional com papel 'emsys'):
-- o agente só opera num cliente quando as duas bases estão cadastradas e os CNPJs delas batem
-- (tabela empresa do AS x tab_empresa do EMSys3). Isso impede misturar bases de clientes diferentes.
ALTER TABLE agente_clientes_bases
  ADD COLUMN IF NOT EXISTS papel TEXT NOT NULL DEFAULT 'outro';

DO $$
BEGIN
  ALTER TABLE agente_clientes_bases
    ADD CONSTRAINT chk_agente_bases_papel CHECK (papel IN ('emsys', 'outro'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- No máximo 1 base EMSys3 por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_agente_base_emsys_por_cliente
  ON agente_clientes_bases (cliente_id) WHERE papel = 'emsys';

ALTER TABLE agente_clientes
  ADD COLUMN IF NOT EXISTS vinculo_validado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vinculo_cnpjs TEXT,
  ADD COLUMN IF NOT EXISTS vinculo_erro TEXT;

-- Clientes já cadastrados: se existe exatamente UMA base com "emsys" no nome, ela vira a base EMSys3.
-- (O vínculo em si é validado na primeira varredura / no botão "Validar vínculo".)
UPDATE agente_clientes_bases b
   SET papel = 'emsys'
 WHERE b.nome ILIKE '%emsys%'
   AND (SELECT COUNT(*) FROM agente_clientes_bases x
         WHERE x.cliente_id = b.cliente_id AND x.nome ILIKE '%emsys%') = 1;
