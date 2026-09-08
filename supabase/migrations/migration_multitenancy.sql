-- ============================================================
-- MATH MASTERY - MULTI-TENANCY MIGRATION
-- Data: 2026-08-19
-- Descrição: Adiciona suporte a múltiplas escolas (tenants)
-- ============================================================

-- ============================================================
-- 1. CRIAR TABELA DE ESCOLAS (TENANTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  theme JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  max_students INT DEFAULT 100,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  admin_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_admin_id ON tenants(admin_id);

-- ============================================================
-- 2. CRIAR TABELA DE RELAÇÃO USUÁRIO-ESCOLA
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_users (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin', 'superadmin')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON tenant_users(role);

-- ============================================================
-- 3. ADICIONAR COLUNA TENANT_ID NAS TABELAS EXISTENTES
-- ============================================================

-- Tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- Tabela quests
ALTER TABLE quests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_quests_tenant_id ON quests(tenant_id);

-- Tabela store_items
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_store_items_tenant_id ON store_items(tenant_id);

-- Tabela user_items
ALTER TABLE user_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_user_items_tenant_id ON user_items(tenant_id);

-- Tabela quest_attempts
ALTER TABLE quest_attempts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_quest_attempts_tenant_id ON quest_attempts(tenant_id);

-- Tabela live_quests
ALTER TABLE live_quests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_live_quests_tenant_id ON live_quests(tenant_id);

-- Tabela xp_logs
ALTER TABLE xp_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_xp_logs_tenant_id ON xp_logs(tenant_id);

-- Tabela system_collections
ALTER TABLE system_collections ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX IF NOT EXISTS idx_system_collections_tenant_id ON system_collections(tenant_id);

-- Tabela preset_skins (global, não por tenant)
-- Não precisa de tenant_id

-- Tabela 3d_models (global, não por tenant)
-- Não precisa de tenant_id

-- Tabela monsters (global, não por tenant)
-- Não precisa de tenant_id

-- ============================================================
-- 4. CRIAR TENANT PADRÃO PARA DADOS EXISTENTES
-- ============================================================
INSERT INTO tenants (id, name, slug, status, config)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Escola Padrão',
  'escola-padrao',
  'active',
  '{"isDefault": true, "description": "Escola padrão com dados migrados"}'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. MIGRAR DADOS EXISTENTES PARA TENANT PADRÃO
-- ============================================================

-- Atualizar users
UPDATE users SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Atualizar quests
UPDATE quests SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Atualizar store_items
UPDATE store_items SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Atualizar user_items
UPDATE user_items SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Atualizar quest_attempts
UPDATE quest_attempts SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Atualizar live_quests
UPDATE live_quests SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Atualizar xp_logs
UPDATE xp_logs SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Criar relação tenant_users para todos os usuários existentes
INSERT INTO tenant_users (tenant_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001',
  id,
  CASE
    WHEN role = 'admin' THEN 'admin'
    WHEN role = 'teacher' THEN 'teacher'
    ELSE 'student'
  END
FROM users
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ============================================================
-- 6. TORNAR TENANT_ID NOT NULL (após migração)
-- ============================================================

-- Só executar após confirmar que todos os dados foram migrados
-- ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE quests ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE store_items ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE user_items ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE quest_attempts ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE live_quests ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE xp_logs ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================
-- 7. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS nas tabelas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. CRIAR POLÍTICAS RLS
-- ============================================================

-- Função auxiliar para verificar se é superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função auxiliar para obter tenant_id atual
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_tenant', true)::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função auxiliar para verificar se usuário pertence ao tenant
CREATE OR REPLACE FUNCTION user_belongs_to_tenant(tenant_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenant_users
    WHERE tenant_id = tenant_uuid AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- POLÍTICAS PARA TABELA: tenants
-- ============================================================

-- Superadmin vê todas as escolas
CREATE POLICY "superadmin_all_tenants" ON tenants
  FOR ALL
  USING (is_superadmin());

-- Admin vê apenas sua escola
CREATE POLICY "admin_own_tenant" ON tenants
  FOR SELECT
  USING (
    id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: tenant_users
-- ============================================================

-- Superadmin vê todas as relações
CREATE POLICY "superadmin_all_tenant_users" ON tenant_users
  FOR ALL
  USING (is_superadmin());

-- Usuários veem relações do seu tenant
CREATE POLICY "users_own_tenant_users" ON tenant_users
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Admin pode gerenciar relações do seu tenant
CREATE POLICY "admin_manage_tenant_users" ON tenant_users
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: users
-- ============================================================

-- Superadmin vê todos os usuários
CREATE POLICY "superadmin_all_users" ON users
  FOR ALL
  USING (is_superadmin());

-- Usuários veem apenas usuários do mesmo tenant
CREATE POLICY "users_same_tenant" ON users
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
    OR id = auth.uid()
  );

-- Admin pode gerenciar usuários do seu tenant
CREATE POLICY "admin_manage_tenant_users_users" ON users
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: quests
-- ============================================================

-- Superadmin vê todas as missões
CREATE POLICY "superadmin_all_quests" ON quests
  FOR ALL
  USING (is_superadmin());

-- Usuários veem missões do seu tenant
CREATE POLICY "users_tenant_quests" ON quests
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Admin/Teacher pode gerenciar missões do seu tenant
CREATE POLICY "admin_manage_tenant_quests" ON quests
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: store_items
-- ============================================================

-- Superadmin vê todos os itens
CREATE POLICY "superadmin_all_store_items" ON store_items
  FOR ALL
  USING (is_superadmin());

-- Usuários veem itens da loja do seu tenant
CREATE POLICY "users_tenant_store_items" ON store_items
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Admin pode gerenciar itens da loja do seu tenant
CREATE POLICY "admin_manage_tenant_store_items" ON store_items
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: user_items
-- ============================================================

-- Superadmin vê todos os itens de usuários
CREATE POLICY "superadmin_all_user_items" ON user_items
  FOR ALL
  USING (is_superadmin());

-- Usuários veem seus próprios itens
CREATE POLICY "users_own_items" ON user_items
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Usuários podem modificar seus próprios itens
CREATE POLICY "users_modify_own_items" ON user_items
  FOR ALL
  USING (student_id = auth.uid());

-- Admin pode gerenciar itens do seu tenant
CREATE POLICY "admin_manage_tenant_items" ON user_items
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: quest_attempts
-- ============================================================

-- Superadmin vê todas as tentativas
CREATE POLICY "superadmin_all_quest_attempts" ON quest_attempts
  FOR ALL
  USING (is_superadmin());

-- Usuários veem tentativas do seu tenant
CREATE POLICY "users_tenant_quest_attempts" ON quest_attempts
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Usuários podem criar suas próprias tentativas
CREATE POLICY "users_create_own_attempts" ON quest_attempts
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- ============================================================
-- POLÍTICAS PARA TABELA: live_quests
-- ============================================================

-- Superadmin vê todas as missões ao vivo
CREATE POLICY "superadmin_all_live_quests" ON live_quests
  FOR ALL
  USING (is_superadmin());

-- Usuários veem missões ao vivo do seu tenant
CREATE POLICY "users_tenant_live_quests" ON live_quests
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Admin pode gerenciar missões ao vivo do seu tenant
CREATE POLICY "admin_manage_tenant_live_quests" ON live_quests
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- ============================================================
-- POLÍTICAS PARA TABELA: xp_logs
-- ============================================================

-- Superadmin vê todos os logs
CREATE POLICY "superadmin_all_xp_logs" ON xp_logs
  FOR ALL
  USING (is_superadmin());

-- Usuários veem logs do seu tenant
CREATE POLICY "users_tenant_xp_logs" ON xp_logs
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. FUNÇÕES AUXILIARES
-- ============================================================

-- Função para definir tenant atual (chamada pelo frontend)
CREATE OR REPLACE FUNCTION set_current_tenant(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant', tenant_uuid::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter tenant do usuário atual
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

-- Função para verificar se usuário é admin do tenant
CREATE OR REPLACE FUNCTION is_tenant_admin(tenant_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenant_users
    WHERE tenant_id = tenant_uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. TRIGGER PARA AUTO-ASSIGN TENANT_ID
-- ============================================================

-- Função para auto-atribuir tenant_id em inserts
CREATE OR REPLACE FUNCTION auto_assign_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para auto-assign
CREATE TRIGGER trigger_users_tenant_id
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

CREATE TRIGGER trigger_quests_tenant_id
  BEFORE INSERT ON quests
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

CREATE TRIGGER trigger_store_items_tenant_id
  BEFORE INSERT ON store_items
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

CREATE TRIGGER trigger_user_items_tenant_id
  BEFORE INSERT ON user_items
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

CREATE TRIGGER trigger_quest_attempts_tenant_id
  BEFORE INSERT ON quest_attempts
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

CREATE TRIGGER trigger_live_quests_tenant_id
  BEFORE INSERT ON live_quests
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

CREATE TRIGGER trigger_xp_logs_tenant_id
  BEFORE INSERT ON xp_logs
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

-- ============================================================
-- 11. POLÍTICAS PARA SYSTEM_COLLECTIONS (Global)
-- ============================================================

-- system_collections é global, não por tenant
-- Mas se precisar de isolamento, descomente:
-- ALTER TABLE system_collections ADD COLUMN IF NOT EXISTS tenant_id UUID;
-- CREATE INDEX IF NOT EXISTS idx_system_collections_tenant_id ON system_collections(tenant_id);

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================

-- Verificar se tudo foi criado corretamente
DO $$
BEGIN
  RAISE NOTICE 'Migração multi-tenancy concluída com sucesso!';
  RAISE NOTICE 'Tenant padrão criado: 00000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'Próximos passos:';
  RAISE NOTICE '1. Executar este script no Supabase SQL Editor';
  RAISE NOTICE '2. Verificar se todos os dados foram migrados';
  RAISE NOTICE '3. Descomentar as linhas NOT NULL após validação';
  RAISE NOTICE '4. Criar TenantContext.tsx no frontend';
END $$;
