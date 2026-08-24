-- ============================================================
-- MIGRAÇÃO: Rastrear rejeição de alunos pré-autorizados
-- Adiciona a coluna rejected em pre_authorized_students
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE pre_authorized_students ADD COLUMN IF NOT EXISTS rejected boolean DEFAULT false;

-- Verificação
SELECT id, name, class_name, rejected FROM pre_authorized_students LIMIT 10;