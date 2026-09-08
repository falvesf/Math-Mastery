-- Adiciona as colunas de Movimento do Fundo de Batalha na tabela quests
-- Execute isso no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query)

ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "battleBgMoveEnabled" boolean DEFAULT true;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "battleBgMoveDirection" text DEFAULT 'diagonal';
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "battleBgMoveSpeed" integer DEFAULT 10;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "battleBgMoveDuration" integer DEFAULT 30;