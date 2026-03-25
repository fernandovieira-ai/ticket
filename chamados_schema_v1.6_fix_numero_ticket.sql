-- ============================================================
-- Migração v1.6 — Fix fn_gerar_numero_ticket (somente número)
-- Gera número sequencial sem prefixo, no formato 000001.
-- Lê o MAX de tickets numéricos (puros) ou da parte numérica
-- de tickets no formato PREFIX-NNNNN para evitar regressão.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gerar_numero_ticket(p_empresa_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      -- formato antigo: PREFIX-NNNNN
      WHEN numero ~ '^[^-]+-[0-9]+$'
           THEN SPLIT_PART(numero, '-', 2)::BIGINT
      -- formato atual: somente dígitos
      WHEN numero ~ '^[0-9]+$'
           THEN numero::BIGINT
      ELSE NULL
    END
  ), 0) + 1
    INTO v_seq FROM tickets WHERE empresa_id = p_empresa_id;

  RETURN LPAD(v_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;
