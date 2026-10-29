-- Migration: Adicionar colunas de departamento e usuário em whatsapp_contatos
-- Criado em: 2026-07-30
-- Motivo: Permitir filtrar contatos WhatsApp por departamento ao enviar notificações

-- Adicionar colunas se não existirem
ALTER TABLE whatsapp_contatos
  ADD COLUMN IF NOT EXISTS id_departamentos UUID REFERENCES departamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS usuarios_id      UUID REFERENCES usuarios(id)      ON DELETE SET NULL;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_wp_contatos_depto ON whatsapp_contatos(id_departamentos);
CREATE INDEX IF NOT EXISTS idx_wp_contatos_usuario ON whatsapp_contatos(usuarios_id);

-- Comentários nas colunas para documentação
COMMENT ON COLUMN whatsapp_contatos.id_departamentos IS 'Departamento vinculado ao contato (filtro de notificações)';
COMMENT ON COLUMN whatsapp_contatos.usuarios_id IS 'Usuário vinculado ao contato (opcional)';

-- Verificar se as colunas foram criadas com sucesso
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contatos'
      AND column_name = 'id_departamentos'
  ) THEN
    RAISE NOTICE '✅ Coluna id_departamentos criada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Falha ao criar coluna id_departamentos';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_contatos'
      AND column_name = 'usuarios_id'
  ) THEN
    RAISE NOTICE '✅ Coluna usuarios_id criada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Falha ao criar coluna usuarios_id';
  END IF;
END $$;
