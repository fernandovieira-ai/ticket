-- Atualiza constraint de tipo para alinhar com os valores que a IA gera
-- Valores antigos: configuracao, query_sql, logica, permissao, outro
-- Valores novos:   configuracao, dados, codigo, infraestrutura, outro

-- Substitui o constraint antes de migrar os valores
ALTER TABLE agente_propostas
  DROP CONSTRAINT IF EXISTS agente_propostas_tipo_check;

-- Migra valores existentes para o novo schema
UPDATE agente_propostas SET tipo = 'dados'          WHERE tipo = 'query_sql';
UPDATE agente_propostas SET tipo = 'codigo'         WHERE tipo = 'logica';
UPDATE agente_propostas SET tipo = 'configuracao'   WHERE tipo = 'permissao';
UPDATE agente_propostas SET tipo = 'outro'          WHERE tipo NOT IN ('configuracao','dados','codigo','infraestrutura','outro');

-- Substitui o constraint
ALTER TABLE agente_propostas
  ADD CONSTRAINT agente_propostas_tipo_check
    CHECK (tipo IN ('configuracao','dados','codigo','infraestrutura','outro'));
