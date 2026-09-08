-- ============================================================
-- MIGRAÇÃO: ACESSO E COLUNAS DA TABELA custom_ranks (patentes)
-- Sintoma: erros do tipo "Could not find the 'X' column of
-- 'custom_ranks' in the schema cache" ao salvar/importar patentes,
-- e/ou patentes que somem ao editar.
-- Causa 1: a tabela usa colunas camelCase (minXp, imageUrl, ...)
-- mas faltam algumas colunas que o código envia no INSERT/UPDATE.
-- Causa 2: se a tabela foi criada pelo dashboard do Supabase, o
-- RLS fica ATIVADO por padrão e, sem políticas, BLOQUEIA escrita.
-- Como o código já filtra por tenant_id no app, desabilitamos o RLS.
-- Rodar UMA VEZ no Supabase SQL Editor. Idempotente.
-- ============================================================

-- 1) Garantir TODAS as colunas usadas pelo código (IF NOT EXISTS = no-op se já existirem)
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS hide_from_history BOOLEAN DEFAULT FALSE;
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS "rankUpChestItems" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS "rankUpChestModelId" text;
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS "audioUrl" text;
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS "variants" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS "imageUrl" text;
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS "minXp" integer;

-- 2) Garantir acesso (desabilita RLS bloqueante)
ALTER TABLE public.custom_ranks DISABLE ROW LEVEL SECURITY;

-- Diagnóstico: confirma RLS desabilitado e lista as colunas atuais
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'custom_ranks';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'custom_ranks'
ORDER BY ordinal_position;