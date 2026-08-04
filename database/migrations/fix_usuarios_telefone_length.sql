-- Migration: Expandir coluna telefone em usuarios de VARCHAR(11) para VARCHAR(30)
-- Criado em: 2026-08-04
-- Motivo: Coluna telefone criada originalmente com VARCHAR(11) impede salvar
--         números com formatação como (11) 99999-9999 (15 chars).

ALTER TABLE usuarios ALTER COLUMN telefone TYPE VARCHAR(30);
