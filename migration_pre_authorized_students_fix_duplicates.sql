-- Corrige duplicatas em pre_authorized_students (tratando tenant_id NULL)
-- Execute no SQL Editor do Supabase

-- 1. Remove TODAS as duplicatas, considerando tenant_id NULL como igual
-- Mantém o registro com menor id (primeiro criado)
DELETE FROM public.pre_authorized_students a
USING public.pre_authorized_students b
WHERE a.id > b.id
  AND COALESCE(a.tenant_id, '') = COALESCE(b.tenant_id, '')
  AND LOWER(a.name) = LOWER(b.name);

-- 2. Remove a constraint única antiga (se existir) que não trata NULL
ALTER TABLE public.pre_authorized_students DROP CONSTRAINT IF EXISTS pre_authorized_students_tenant_name_key;

-- 3. Cria um ÍNDICE ÚNICO FUNCIONAL que trata tenant_id NULL como ''
-- Assim o banco impede duplicatas de verdade, mesmo com tenant NULL
DROP INDEX IF EXISTS pre_authorized_students_tenant_name_unique;
CREATE UNIQUE INDEX pre_authorized_students_tenant_name_unique
  ON public.pre_authorized_students (COALESCE(tenant_id, ''), LOWER(name));
