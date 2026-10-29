-- ============================================================
-- Controle de liberacao das instalacoes do Remote Assist DRF
-- Executar em: digitalrf-help (drfticket)
-- Cada linha = uma instalacao (edicao Cliente) identificada pelo
-- device_id (ID de 9 digitos exibido no app, Core/DeviceIdentity.cs).
-- O relay (RemoteAssist.Relay) consulta esta tabela via
-- /api/remoteassist/licencas/verificar antes de aceitar o registro
-- do anfitriao. Ver app/api/remoteassist/licencas/README (se houver)
-- ou PROJETO.md para o fluxo completo.
-- ============================================================

CREATE TABLE IF NOT EXISTS remoteassist_licencas (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         VARCHAR(9)   NOT NULL UNIQUE,
  nome_cliente      VARCHAR(150),
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','ativo','suspenso','cancelado')),
  vencimento        DATE,
  obs               TEXT,
  ultimo_contato_em TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remoteassist_licencas_status ON remoteassist_licencas (status);
CREATE INDEX IF NOT EXISTS idx_remoteassist_licencas_vencimento ON remoteassist_licencas (vencimento);
