-- ============================================================
-- MIGRAÇÃO: Escola ativa do usuário (superadmin/multi-escola)
-- Persiste no banco a escola que o usuário está usando/visitando.
-- O carregamento lê do banco (localStorage vira apenas cache).
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_tenant_id text;

-- Verificação
SELECT id, email, selected_tenant_id FROM users LIMIT 10;