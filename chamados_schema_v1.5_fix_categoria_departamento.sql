-- ============================================================
-- MIGRAÇÃO v1.5 - Corrige relacionamentos N:N
-- 1. categoria <> departamento: remove colunas redundantes de `categorias`
-- 2. subcategoria <> categoria: remove coluna redundante de `subcategorias`
-- Mantém somente as tabelas de junção para relacionamentos N:N.
-- ============================================================

-- 1. Remove FK e colunas redundantes de `categorias`
ALTER TABLE public.categorias
  DROP CONSTRAINT IF EXISTS categorias_departamento_id_fkey;

ALTER TABLE public.categorias
  DROP COLUMN IF EXISTS departamento_id,
  DROP COLUMN IF EXISTS id_departamentos,
  DROP COLUMN IF EXISTS id_empresas;

-- 2. Garante FK e DEFAULT na tabela de junção
ALTER TABLE public.cadegoria_departamento
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD CONSTRAINT IF NOT EXISTS fk_catdep_categoria
    FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE,
  ADD CONSTRAINT IF NOT EXISTS fk_catdep_departamento
    FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id) ON DELETE CASCADE;

-- 3. Índices para performance (categoria <> departamento)
CREATE INDEX IF NOT EXISTS idx_catdep_categoria    ON public.cadegoria_departamento (categoria_id);
CREATE INDEX IF NOT EXISTS idx_catdep_departamento ON public.cadegoria_departamento (departamento_id);

-- ============================================================
-- 4. Remove coluna redundante de `subcategorias`
-- ============================================================
ALTER TABLE public.subcategorias
  DROP COLUMN IF EXISTS id_categorias;

-- 5. Garante FK e DEFAULT na tabela de junção
ALTER TABLE public.cadegoria_subcategoria
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD CONSTRAINT IF NOT EXISTS fk_catsub_subcategoria
    FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id) ON DELETE CASCADE,
  ADD CONSTRAINT IF NOT EXISTS fk_catsub_categoria
    FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE;

-- 6. Índices para performance (subcategoria <> categoria)
CREATE INDEX IF NOT EXISTS idx_catsub_subcategoria ON public.cadegoria_subcategoria (subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_catsub_categoria    ON public.cadegoria_subcategoria (categoria_id);

-- ============================================================
-- 7. Corrige FK de tickets.subcategoria_id
--    (antes apontava para categorias, agora aponta para subcategorias)
-- ============================================================
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_subcategoria_id_fkey;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_subcategoria_id_fkey
    FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id) ON DELETE SET NULL;
