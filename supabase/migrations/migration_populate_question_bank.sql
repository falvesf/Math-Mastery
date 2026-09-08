-- ============================================================
-- MIGRAÇÃO: QUESTION_BANK — DESABILITAR RLS + POPULAR COM PERGUNTAS
-- 1. Desabilita RLS na tabela question_bank (padrão do projeto:
--    isolamento no nível da aplicação).
-- 2. Garante a coluna tenant_id (para suporte a perguntas por escola).
-- 3. Insere no banco GLOBAL (tenant_id null) todas as perguntas das
--    missões já cadastradas (quests.questions), sem duplicar.
-- Rode UMA VEZ no Supabase SQL Editor.
-- ============================================================

-- 1) RLS off + coluna tenant_id
ALTER TABLE question_bank DISABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 2) Garantir índice único em title (dedup na fonte) — se já existir, não quebra
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'question_bank' AND indexname = 'question_bank_title_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'question_bank'::regclass AND contype = 'u'
  ) THEN
    ALTER TABLE question_bank ADD CONSTRAINT question_bank_title_unique UNIQUE (title);
  END IF;
END $$;

-- 3) Popular com as perguntas das missões existentes (globais), dedup por título
INSERT INTO question_bank (title, image_url, options, correct_index, time_limit, category, difficulty, tags, created_by, created_at)
SELECT DISTINCT ON (LOWER(TRIM(qq->>'title')))
  qq->>'title' AS title,
  qq->>'imageUrl' AS image_url,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('text', o->>'text', 'imageUrl', o->>'imageUrl'))
     FROM jsonb_array_elements(COALESCE(qq->'options', '[]'::jsonb)) AS o
     WHERE o->>'text' IS NOT NULL),
    '[]'::jsonb
  ) AS options,
  COALESCE((qq->>'correctIndex')::int, 0) AS correct_index,
  COALESCE((qq->>'timeLimit')::int, 30) AS time_limit,
  'geral' AS category,
  'medio' AS difficulty,
  '{}'::text[] AS tags,
  NULL AS created_by,
  NOW() AS created_at
FROM quests q
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.questions, '[]'::jsonb)) AS qq
WHERE qq->>'title' IS NOT NULL
  AND LENGTH(TRIM(qq->>'title')) > 0
ON CONFLICT (title) DO NOTHING;

-- 4) Verificação
SELECT count(*) AS total_perguntas_no_banco FROM question_bank;