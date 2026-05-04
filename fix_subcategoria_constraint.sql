-- Fix foreign key constraint for subcategoria_id in solicitacoes_internas
-- Drop the incorrect constraint that references categorias table
ALTER TABLE solicitacoes_internas
DROP CONSTRAINT IF EXISTS solicitacoes_internas_subcategoria_id_fkey;

-- Add the correct constraint that references subcategorias table
ALTER TABLE solicitacoes_internas
ADD CONSTRAINT solicitacoes_internas_subcategoria_id_fkey
FOREIGN KEY (subcategoria_id) REFERENCES subcategorias(id);