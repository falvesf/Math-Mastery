-- Adiciona restrição única em (tenant_id, name) para evitar duplicatas
-- Execute no SQL Editor do Supabase

-- Remove duplicatas existentes (mantém a mais recente por nome+tenant)
DELETE FROM public.pre_authorized_students a
USING public.pre_authorized_students b
WHERE a.id > b.id
  AND a.tenant_id IS NOT DISTINCT FROM b.tenant_id
  AND a.name = b.name;

-- Adiciona a restrição única
ALTER TABLE public.pre_authorized_students
  ADD CONSTRAINT pre_authorized_students_tenant_name_key
  UNIQUE (tenant_id, name);
