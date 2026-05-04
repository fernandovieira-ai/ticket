-- Migração: Adicionar categoria e subcategoria nas solicitações internas
-- Data: 2026-05-04
-- Nota: Corrigido para usar tabelas separadas categorias e subcategorias

BEGIN;

-- Adicionar colunas categoria_id e subcategoria_id na tabela solicitacoes_internas
-- categoria_id referencia categorias, subcategoria_id referencia subcategorias
ALTER TABLE solicitacoes_internas
ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES subcategorias(id) ON DELETE SET NULL;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_solic_categoria ON solicitacoes_internas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_solic_subcategoria ON solicitacoes_internas(subcategoria_id);

-- Adicionar comentários para documentação
COMMENT ON COLUMN solicitacoes_internas.categoria_id IS 'Categoria principal da solicitação (referencia categorias)';
COMMENT ON COLUMN solicitacoes_internas.subcategoria_id IS 'Subcategoria específica da solicitação (referencia subcategorias)';

COMMIT;