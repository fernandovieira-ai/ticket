-- Adiciona o modo 'ajustar_estoque' ao check constraint de agente_regras_painel.modo
-- (lança entrada de estoque por inventário cobrindo o déficit real e reprocessa, sem IA).
-- Depende de add_agente_regras_painel.sql já aplicada.
ALTER TABLE agente_regras_painel DROP CONSTRAINT IF EXISTS agente_regras_painel_modo_check;
ALTER TABLE agente_regras_painel ADD CONSTRAINT agente_regras_painel_modo_check
  CHECK (modo IN ('somente_reprocessar', 'ajustar_pagamento', 'ajustar_estoque', 'elegivel_automatico', 'assistido', 'manual'));
