-- ============================================================
-- MIGRAÇÃO DE DIAGNÓSTICO: ENCONTRAR ALUNO "SUMIDO" (LIMBO)
-- Rode no Supabase SQL Editor para ver onde o aluno está:
--  * users.tenant_id (escola que aparece em users)
--  * access_tenants (escolas de acesso em tenant_users)
--  * class_id (turma)
-- Um aluno fica INVISÍVEL numa escola quando NÃO tem o tenant_id
-- dela em users E NÃO tem linha em tenant_users para ela.
-- ============================================================

-- 1) Escolas cadastradas (para copiar o id da escola correta)
SELECT id, name, slug FROM public.tenants ORDER BY name;

-- 2) Buscar o aluno pelo NOME COMPLETO.
--    Substitua :student_name pelo nome exato do aluno (ex: 'João da Silva').
SELECT
  u.id,
  u.name,
  u.email,
  u.role,
  u.class_id,
  u.tenant_id AS users_tenant,
  COALESCE(tu.access_tenants::text, '{}') AS access_tenants,
  CASE
    WHEN u.tenant_id IS NULL THEN 'SEM TENANT (users)'
    WHEN tu.access_tenants IS NULL OR NOT (u.tenant_id = ANY(tu.access_tenants))
      THEN 'LIMBO: users.tenant_id fora das escolas de acesso'
    ELSE 'ok'
  END AS status
FROM public.users u
LEFT JOIN (
  SELECT user_id, array_agg(tenant_id) AS access_tenants
  FROM public.tenant_users
  GROUP BY user_id
) tu ON tu.user_id = u.id
WHERE u.role = 'student'
  AND u.name = 'Davi Lucas Rodrigues Sanches'
ORDER BY u.name;