-- Guarda o "codigo" (identificador da linha) em exchange_emsys_gestao_monitoramento_pend
-- de onde o erro veio, quando a análise usou o painel builtin (analise_painel=true).
-- Necessário para marcar reprocessar=true nesse registro específico quando a correção
-- for aprovada/aplicada — sem isso a mesma pendência do painel AS é redetectada todo
-- scan e tratada como "correção não funcionou".
ALTER TABLE agente_propostas
  ADD COLUMN IF NOT EXISTS painel_codigo TEXT;
