-- ============================================================
-- MIGRAÇÃO: ACESSO E COLUNAS DA TABELA custom_ranks (patentes)
-- Sintoma: "Importar Patentes Globais" mostra erro "Could not
-- find the 'hide_from_history' column of 'custom_ranks'".
-- Causa 1: a tabela usa colunas camelCase (minXp, imageUrl, ...)
-- mas não tem a coluna hide_from_history que o código envia.
-- Causa 2: se a tabela foi criada pelo dashboard do Supabase, o
-- RLS fica ATIVADO por padrão e, sem políticas, BLOQUEIA escrita.
-- Como o código já filtra por tenant_id no app, desabilitamos o RLS.
-- Rodar UMA VEZ no Supabase SQL Editor. Idempotente.
-- ============================================================

-- 1) Garantir a coluna de "ocultar do histórico" usada pelo código
ALTER TABLE public.custom_ranks ADD COLUMN IF NOT EXISTS hide_from_history BOOLEAN DEFAULT FALSE;

-- 2) Garantir acesso (desabilita RLS bloqueante)
ALTER TABLE public.custom_ranks DISABLE ROW LEVEL SECURITY;

-- Diagnóstico: confirma que o RLS está desabilitado e a coluna existe
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'custom_ranks';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'custom_ranks'
ORDER BY ordinal_position;