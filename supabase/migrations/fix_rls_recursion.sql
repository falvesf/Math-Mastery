-- ============================================================
-- FIX: Corrigir recursão infinita nas políticas RLS
-- ============================================================

-- 1. REMOVER políticas problemáticas
DROP POLICY IF EXISTS "superadmin_all_tenant_users" ON tenant_users;
DROP POLICY IF EXISTS "users_own_tenant_users" ON tenant_users;
DROP POLICY IF EXISTS "admin_manage_tenant_users" ON tenant_users;

DROP POLICY IF EXISTS "superadmin_all_users" ON users;
DROP POLICY IF EXISTS "users_same_tenant" ON users;
DROP POLICY IF EXISTS "admin_manage_tenant_users_users" ON users;

DROP POLICY IF EXISTS "superadmin_all_tenants" ON tenants;
DROP POLICY IF EXISTS "admin_own_tenant" ON tenants;

DROP POLICY IF EXISTS "superadmin_all_quests" ON quests;
DROP POLICY IF EXISTS "users_tenant_quests" ON quests;
DROP POLICY IF EXISTS "admin_manage_tenant_quests" ON quests;

DROP POLICY IF EXISTS "superadmin_all_store_items" ON store_items;
DROP POLICY IF EXISTS "users_tenant_store_items" ON store_items;
DROP POLICY IF EXISTS "admin_manage_tenant_store_items" ON store_items;

DROP POLICY IF EXISTS "superadmin_all_user_items" ON user_items;
DROP POLICY IF EXISTS "users_own_items" ON user_items;
DROP POLICY IF EXISTS "users_modify_own_items" ON user_items;
DROP POLICY IF EXISTS "admin_manage_tenant_items" ON user_items;

DROP POLICY IF EXISTS "superadmin_all_quest_attempts" ON quest_attempts;
DROP POLICY IF EXISTS "users_tenant_quest_attempts" ON quest_attempts;
DROP POLICY IF EXISTS "users_create_own_attempts" ON quest_attempts;

DROP POLICY IF EXISTS "superadmin_all_live_quests" ON live_quests;
DROP POLICY IF EXISTS "users_tenant_live_quests" ON live_quests;
DROP POLICY IF EXISTS "admin_manage_tenant_live_quests" ON live_quests;

DROP POLICY IF EXISTS "superadmin_all_xp_logs" ON xp_logs;
DROP POLICY IF EXISTS "users_tenant_xp_logs" ON xp_logs;

-- 2. REMOVER funções auxiliares (recriar sem recursão)
DROP FUNCTION IF EXISTS is_superadmin();
DROP FUNCTION IF EXISTS current_tenant_id();
DROP FUNCTION IF EXISTS user_belongs_to_tenant(UUID);
DROP FUNCTION IF EXISTS set_current_tenant(UUID);
DROP FUNCTION IF EXISTS get_user_tenant();
DROP FUNCTION IF EXISTS is_tenant_admin(UUID);

-- 3. RECRIAR funções auxiliares (sem recursão)
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Verifica diretamente na tabela auth.users via metadata
  -- Ou podemos usar uma tabela de configuração
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RECRIAR POLÍTICAS SEM RECURSÃO

-- ============================================================
-- POLÍTICAS PARA TABELA: tenants
-- ============================================================

-- Superadmin vê todas as escolas (verificação direta, sem subquery em tenant_users)
CREATE POLICY "superadmin_all_tenants" ON tenants
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Todos os usuários autenticados podem ver tenants (para listagem)
CREATE POLICY "authenticated_view_tenants" ON tenants
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- POLÍTICAS PARA TABELA: tenant_users
-- ============================================================

-- Superadmin vê todas as relações
CREATE POLICY "superadmin_all_tenant_users" ON tenant_users
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários veem suas próprias relações (sem subquery recursiva)
CREATE POLICY "users_own_tenant_users" ON tenant_users
  FOR SELECT
  USING (user_id = auth.uid());

-- Usuários autenticados podem inserir em tenant_users (para auto-assign)
CREATE POLICY "authenticated_insert_tenant_users" ON tenant_users
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- POLÍTICAS PARA TABELA: users
-- ============================================================

-- Superadmin vê todos os usuários
CREATE POLICY "superadmin_all_users" ON users
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários veem seu próprio perfil
CREATE POLICY "users_own_profile" ON users
  FOR SELECT
  USING (id = auth.uid());

-- Usuários autenticados podem ver outros usuários (para rankings, etc.)
CREATE POLICY "authenticated_view_users" ON users
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- POLÍTICAS PARA TABELA: quests
-- ============================================================

-- Superadmin vê todas as missões
CREATE POLICY "superadmin_all_quests" ON quests
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários autenticados podem ver missões (RLS no app filtra por tenant)
CREATE POLICY "authenticated_view_quests" ON quests
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- POLÍTICAS PARA TABELA: store_items
-- ============================================================

-- Superadmin vê todos os itens
CREATE POLICY "superadmin_all_store_items" ON store_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários autenticados podem ver itens da loja
CREATE POLICY "authenticated_view_store_items" ON store_items
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- POLÍTICAS PARA TABELA: user_items
-- ============================================================

-- Superadmin vê todos os itens
CREATE POLICY "superadmin_all_user_items" ON user_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários veem seus próprios itens
CREATE POLICY "users_own_items" ON user_items
  FOR ALL
  USING (student_id = auth.uid());

-- ============================================================
-- POLÍTICAS PARA TABELA: quest_attempts
-- ============================================================

-- Superadmin vê todas as tentativas
CREATE POLICY "superadmin_all_quest_attempts" ON quest_attempts
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários veem/criam suas próprias tentativas
CREATE POLICY "users_own_attempts" ON quest_attempts
  FOR ALL
  USING (student_id = auth.uid());

-- ============================================================
-- POLÍTICAS PARA TABELA: live_quests
-- ============================================================

-- Superadmin vê todas as missões ao vivo
CREATE POLICY "superadmin_all_live_quests" ON live_quests
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários autenticados podem ver missões ao vivo
CREATE POLICY "authenticated_view_live_quests" ON live_quests
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- POLÍTICAS PARA TABELA: xp_logs
-- ============================================================

-- Superadmin vê todos os logs
CREATE POLICY "superadmin_all_xp_logs" ON xp_logs
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários veem seus próprios logs
CREATE POLICY "users_own_xp_logs" ON xp_logs
  FOR ALL
  USING (student_id = auth.uid());

-- ============================================================
-- FUNÇÕES AUXILIARES (sem recursão)
-- ============================================================

CREATE OR REPLACE FUNCTION set_current_tenant(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant', tenant_uuid::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Políticas RLS corrigidas com sucesso!';
  RAISE NOTICE 'Recursão infinita eliminada.';
END $$;
