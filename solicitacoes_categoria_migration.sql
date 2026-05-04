-- Migração para adicionar categoria e subcategoria nas solicitações internas
-- Data: 2026-05-04

-- Adicionar colunas categoria_id e subcategoria_id na tabela solicitacoes_internas
ALTER TABLE solicitacoes_internas
ADD COLUMN categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
ADD COLUMN subcategoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL;

-- Criar índices para performance
CREATE INDEX idx_solic_categoria ON solicitacoes_internas(categoria_id);
CREATE INDEX idx_solic_subcategoria ON solicitacoes_internas(subcategoria_id);

-- Verificar se existe tabela subcategorias (caso não exista, usaremos categorias com parent_id)
-- A estrutura já existe usando categorias hierárquicas

COMMENT ON COLUMN solicitacoes_internas.categoria_id IS 'Categoria principal da solicitação';
COMMENT ON COLUMN solicitacoes_internas.subcategoria_id IS 'Subcategoria específica da solicitação';