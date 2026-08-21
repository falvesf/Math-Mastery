-- Cria a tabela pre_authorized_students
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS public.pre_authorized_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text,
  name text NOT NULL,
  class_name text NOT NULL,
  grade text,
  imported_from text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

-- Índice para busca rápida por tenant
CREATE INDEX IF NOT EXISTS pre_authorized_students_tenant_idx 
  ON public.pre_authorized_students (tenant_id);

-- Índice para busca por nome
CREATE INDEX IF NOT EXISTS pre_authorized_students_name_idx 
  ON public.pre_authorized_students (name);
