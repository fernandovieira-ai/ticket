-- Migration v1.9 — campo para instância dedicada ao envio de alertas de grupos
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS alerta_grupos_instancia TEXT DEFAULT NULL;
