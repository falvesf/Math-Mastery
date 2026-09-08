-- ============================================================
-- BACKFILL: sincroniza users.tenant_id a partir de tenant_users
-- ------------------------------------------------------------
-- Contexto: funções como chat, visitas do professor e rankings
-- filtram por users.tenant_id. Usuários que só existem em
-- tenant_users (coluna nula) ficam invisíveis nessas funções.
-- Esse script corrige os dados existentes; o app também passou a
-- se auto-corrigir no login.
-- Obs: evita min(uuid) (não existe nesta instância do Postgres).
-- ============================================================

-- 1) Usuários com EXATAMENTE UMA escola em tenant_users:
--    define users.tenant_id para essa escola.
UPDATE users u
SET tenant_id = tu.tenant_id
FROM tenant_users tu
WHERE u.id = tu.user_id
  AND (u.tenant_id IS NULL OR u.tenant_id <> tu.tenant_id)
  AND NOT EXISTS (
    SELECT 1 FROM tenant_users tu2
    WHERE tu2.user_id = tu.user_id
      AND tu2.tenant_id <> tu.tenant_id
  );

-- 2) Usuários com MÚLTIPLAS escolas e tenant_id nulo:
--    usa a primeira escola (ordem por tenant_id) como padrão.
UPDATE users u
SET tenant_id = chosen.tenant_id
FROM (
  SELECT user_id, tenant_id
  FROM (
    SELECT user_id, tenant_id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY tenant_id) AS rn
    FROM tenant_users
  ) ranked
  WHERE ranked.rn = 1
) chosen
WHERE u.id = chosen.user_id
  AND u.tenant_id IS NULL;

-- 3) Diagnóstico: alunos com turma, mas sem tenant_id (devem ser 0 após o script).
SELECT id, name, class_id, tenant_id
FROM users
WHERE role = 'student'
  AND class_id IS NOT NULL
  AND tenant_id IS NULL;