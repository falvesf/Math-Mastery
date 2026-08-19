-- Adiciona coluna character_name na tabela users
-- Execute no SQL Editor do Supabase

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "character_name" text;

-- Índice para busca case-insensitive de nomes únicos
CREATE UNIQUE INDEX IF NOT EXISTS users_character_name_unique_idx 
  ON public.users (LOWER(character_name)) 
  WHERE character_name IS NOT NULL;
