-- ============================================================
-- SCRIPT DE DIAGNÓSTICO E CORREÇÃO DE ALUNOS PERDIDOS
-- ============================================================

-- 1. DIAGNÓSTICO: Ver todos os usuários com problemas
SELECT 
  id, 
  name, 
  email, 
  role, 
  tenant_id, 
  class_id,
  created_at,
  CASE 
    WHEN role = 'pending_student' THEN 'Pendente de aprovação'
    WHEN role = 'student' AND tenant_id IS NULL THEN 'Sem escola'
    WHEN role = 'student' AND class_id IS NULL THEN 'Sem turma'
    WHEN role = 'student' AND tenant_id IS NOT NULL AND class_id IS NOT NULL THEN 'OK'
    ELSE 'Outro status'
  END as status
FROM users 
WHERE role IN ('student', 'pending_student', 'pending_teacher')
ORDER BY created_at DESC;

-- 2. CORREÇÃO: Alunos pendentes que deveriam ser aprovados
-- (Execute apenas se quiser aprovar todos os pendentes automaticamente)
/*
UPDATE users 
SET 
  role = 'student',
  tenant_id = '00000000-0000-0000-0000-000000000001',
  xp = 0,
  coins = 0
WHERE role = 'pending_student';
*/

-- 3. CORREÇÃO: Alunos sem tenant_id
UPDATE users 
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE role = 'student' AND tenant_id IS NULL;

-- 4. CORREÇÃO: Criar relação tenant_users para alunos sem ela
INSERT INTO tenant_users (tenant_id, user_id, role)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  u.id,
  'student'
FROM users u
WHERE u.role = 'student' 
  AND NOT EXISTS (
    SELECT 1 FROM tenant_users tu 
    WHERE tu.user_id = u.id
  );

-- 5. VERIFICAÇÃO: Ver status final
SELECT 
  u.id, 
  u.name, 
  u.email, 
  u.role, 
  u.tenant_id, 
  u.class_id,
  t.name as tenant_name,
  CASE 
    WHEN u.role = 'student' AND u.tenant_id IS NOT NULL AND u.class_id IS NOT NULL THEN '✅ OK'
    WHEN u.role = 'student' AND u.tenant_id IS NOT NULL AND u.class_id IS NULL THEN '⚠️ Sem turma'
    WHEN u.role = 'student' AND u.tenant_id IS NULL THEN '❌ Sem escola'
    WHEN u.role = 'pending_student' THEN '⏳ Pendente'
    ELSE '❓ Outro'
  END as status
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE u.role IN ('student', 'pending_student')
ORDER BY u.created_at DESC;
