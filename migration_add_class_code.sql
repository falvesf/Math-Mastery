-- Adiciona coluna code na tabela classes para identificação de turmas
-- Execute no SQL Editor do Supabase

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS "code" text;
