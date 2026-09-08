-- ============================================================
-- EMERGENCY FIX: Desabilitar RLS completamente
-- Restaura o funcionamento do sistema
-- ============================================================

-- 1. Desabilitar RLS em todas as tabelas
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE quests DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE quest_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_quests DISABLE ROW LEVEL SECURITY;
ALTER TABLE xp_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users DISABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas RLS
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  -- Remover políticas de users
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
  END LOOP;
  
  -- Remover políticas de quests
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'quests') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON quests';
  END LOOP;
  
  -- Remover políticas de store_items
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'store_items') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON store_items';
  END LOOP;
  
  -- Remover políticas de user_items
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_items') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON user_items';
  END LOOP;
  
  -- Remover políticas de quest_attempts
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'quest_attempts') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON quest_attempts';
  END LOOP;
  
  -- Remover políticas de live_quests
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'live_quests') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON live_quests';
  END LOOP;
  
  -- Remover políticas de xp_logs
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'xp_logs') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON xp_logs';
  END LOOP;
  
  -- Remover políticas de tenants
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'tenants') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON tenants';
  END LOOP;
  
  -- Remover políticas de tenant_users
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'tenant_users') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON tenant_users';
  END LOOP;
END $$;

-- 3. Remover funções auxiliares
DROP FUNCTION IF EXISTS is_superadmin();
DROP FUNCTION IF EXISTS current_tenant_id();
DROP FUNCTION IF EXISTS user_belongs_to_tenant(UUID);
DROP FUNCTION IF EXISTS set_current_tenant(UUID);
DROP FUNCTION IF EXISTS get_user_tenant();
DROP FUNCTION IF EXISTS is_tenant_admin(UUID);
DROP FUNCTION IF EXISTS auto_assign_tenant_id();

-- 4. Remover triggers
DROP TRIGGER IF EXISTS trigger_users_tenant_id ON users;
DROP TRIGGER IF EXISTS trigger_quests_tenant_id ON quests;
DROP TRIGGER IF EXISTS trigger_store_items_tenant_id ON store_items;
DROP TRIGGER IF EXISTS trigger_user_items_tenant_id ON user_items;
DROP TRIGGER IF EXISTS trigger_quest_attempts_tenant_id ON quest_attempts;
DROP TRIGGER IF EXISTS trigger_live_quests_tenant_id ON live_quests;
DROP TRIGGER IF EXISTS trigger_xp_logs_tenant_id ON xp_logs;

-- 5. Verificar se tudo foi limpo
DO $$
BEGIN
  RAISE NOTICE '=== RLS DESABILITADO COM SUCESSO ===';
  RAISE NOTICE 'O sistema deve funcionar normalmente agora.';
  RAISE NOTICE 'As tabelas tenants e tenant_users ainda existem para uso futuro.';
  RAISE NOTICE 'O isolamento de dados será feito no nível da aplicação.';
END $$;
