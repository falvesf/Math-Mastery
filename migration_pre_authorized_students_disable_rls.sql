-- Desativa RLS na tabela pre_authorized_students
-- Tabela gerenciada exclusivamente por admin. Desativar RLS evita bloqueios de INSERT/SELECT/UPDATE/DELETE.
-- Execute no SQL Editor do Supabase

ALTER TABLE public.pre_authorized_students DISABLE ROW LEVEL SECURITY;
