-- Dados de exemplo para categorias e subcategorias
-- Execute após a migração migrate_solicitacoes_categoria.sql

-- Limpar dados existentes (opcional - remova se já há dados importantes)
-- DELETE FROM categorias WHERE empresa_id = '00000000-0000-0000-0000-000000000001';

-- Inserir categorias principais (parent_id = NULL)
INSERT INTO categorias (id, empresa_id, parent_id, nome, descricao, visivel_cliente, ativo, ordem) VALUES
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', NULL, 'TI e Sistemas', 'Questões relacionadas a tecnologia da informação', true, true, 1),
('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', NULL, 'Recursos Humanos', 'Solicitações do setor de RH', true, true, 2),
('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', NULL, 'Compras e Suprimentos', 'Aquisições e materiais', true, true, 3),
('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000001', NULL, 'Manutenção', 'Reparos e manutenções', true, true, 4)
ON CONFLICT (id) DO NOTHING;

-- Inserir subcategorias (parent_id referencia categoria pai)
INSERT INTO categorias (id, empresa_id, parent_id, nome, descricao, visivel_cliente, ativo, ordem) VALUES
-- Subcategorias de TI e Sistemas
('11111111-1111-1111-1111-111111111112', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Hardware', 'Problemas com equipamentos', true, true, 1),
('11111111-1111-1111-1111-111111111113', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Software', 'Problemas com programas e sistemas', true, true, 2),
('11111111-1111-1111-1111-111111111114', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Rede e Internet', 'Conectividade e infraestrutura', true, true, 3),
('11111111-1111-1111-1111-111111111115', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Backup e Recuperação', 'Cópias de segurança', true, true, 4),

-- Subcategorias de Recursos Humanos
('22222222-2222-2222-2222-222222222223', '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Férias e Licenças', 'Solicitações de ausência', true, true, 1),
('22222222-2222-2222-2222-222222222224', '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Treinamento', 'Capacitação e desenvolvimento', true, true, 2),
('22222222-2222-2222-2222-222222222225', '00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Documentos', 'Declarações e comprovantes', true, true, 3),

-- Subcategorias de Compras e Suprimentos
('33333333-3333-3333-3333-333333333334', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Material de Escritório', 'Papelaria e utensílios', true, true, 1),
('33333333-3333-3333-3333-333333333335', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Equipamentos', 'Aquisição de máquinas e ferramentas', true, true, 2),
('33333333-3333-3333-3333-333333333336', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Serviços Terceirizados', 'Contratação de fornecedores', true, true, 3),

-- Subcategorias de Manutenção
('44444444-4444-4444-4444-444444444445', '00000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Elétrica', 'Problemas elétricos', true, true, 1),
('44444444-4444-4444-4444-444444444446', '00000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Hidráulica', 'Problemas de água e esgoto', true, true, 2),
('44444444-4444-4444-4444-444444444447', '00000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Ar Condicionado', 'Climatização', true, true, 3)
ON CONFLICT (id) DO NOTHING;

-- Verificar dados inseridos
SELECT
  c.nome as categoria,
  p.nome as categoria_pai,
  c.parent_id IS NULL as e_categoria_principal
FROM categorias c
LEFT JOIN categorias p ON p.id = c.parent_id
WHERE c.empresa_id = '00000000-0000-0000-0000-000000000001'
ORDER BY c.parent_id NULLS FIRST, c.ordem, c.nome;