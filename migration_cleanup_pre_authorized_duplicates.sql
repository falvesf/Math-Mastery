-- ============================================================
-- LIMPEZA: Pré-autorizados duplicados (sem tenant)
-- Contexto: os 168 alunos sem tenant são a importação ANTIGA
-- (madrugada 2026-08-21). A importação recente (22:31) já está
-- com tenant correto no Colégio (00000000-...-0001).
--
-- Este script:
--   1. Cria backup dos pré-autorizados sem tenant
--   2. Deleta os pré-autorizados sem tenant
--
-- IMPORTANTE: rode UMA VEZ no Supabase SQL Editor.
-- ============================================================

-- 1) BACKUP dos registros sem tenant (para recuperação se necessário)
CREATE TABLE IF NOT EXISTS backup_pre_authorized_sem_tenant AS
SELECT * FROM pre_authorized_students WHERE tenant_id IS NULL;

-- 2) Verificação antes de deletar (quantidade a ser removida)
SELECT count(*) AS registros_sem_tenant
FROM pre_authorized_students
WHERE tenant_id IS NULL;

-- 3) DELETE apenas dos sem tenant (mantém os do Colégio)
DELETE FROM pre_authorized_students
WHERE tenant_id IS NULL;

-- 4) Verificação final
SELECT
  count(*) AS total_restante,
  count(*) FILTER (WHERE tenant_id IS NULL) AS sem_tenant_restantes
FROM pre_authorized_students;