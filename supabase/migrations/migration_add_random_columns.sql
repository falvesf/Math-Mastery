-- Adiciona as colunas de Seleção Aleatória de Questões na tabela quests
-- Execute isso no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query)

ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "randomQuestionSelection" boolean;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "randomQuestionCount" integer;
