-- ============================================================
-- MIGRAÇÃO: CORRIGIR LIMBO DE TENANTS (dados órfãos e fantasma)
-- Descrição:
--   1. Identifica o tenant real do "Colégio Adventista de Ibiúna"
--      (escola original). Fallback: primeira escola não-fantasma.
--   2. Move TODOS os dados órfãos (tenant_id = fantasma OU NULL,
--      exceto globais verdadeiros) para o tenant do Colégio.
--   3. Reconstroi tenant_users de forma consistente.
--   4. Desativa o tenant fantasma "Escola Padrão".
--   5. Recria função+trigger auto_assign_tenant_id p/ novos inserts.
--
-- IMPORTANTE: rode UMA VEZ no Supabase SQL Editor.
-- ============================================================
DO $do$

DECLARE
  ghost_id UUID := '00000000-0000-0000-0000-000000000001';
  target_tenant UUID;
BEGIN
  -- 0) GARANTIR QUE A TABELA DE RELAÇÃO TEM CHAVE PRIMÁRIA (para ON CONFLICT)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tenant_users'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE tenant_users ADD PRIMARY KEY (tenant_id, user_id);
  END IF;

  -- 1) Descobrir o tenant real do Colégio Adventista de Ibiúna
  SELECT id INTO target_tenant
  FROM tenants
  WHERE id <> ghost_id
    AND (name ILIKE '%ibiuna%' OR name ILIKE '%ibiúna%')
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback: se não achou pelo nome, usa a primeira escola não-fantasma
  IF target_tenant IS NULL THEN
    SELECT id INTO target_tenant
    FROM tenants
    WHERE id <> ghost_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF target_tenant IS NULL THEN
    RAISE NOTICE 'Nenhuma escola real encontrada. Migração abortada.';
    RETURN;
  END IF;

  RAISE NOTICE 'Tenant alvo: %', target_tenant;

  -- 2) MOVER DADOS ORFÃOS PARA O TENANT ALVO
  -- Tabelas SEM is_global: todo registro com fantasma/NULL vai para o alvo.

  -- users
  UPDATE users SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- quests
  UPDATE quests SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- classes
  UPDATE classes SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- user_items
  UPDATE user_items SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- quest_attempts
  UPDATE quest_attempts SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- live_quests
  UPDATE live_quests SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- xp_logs
  UPDATE xp_logs SET tenant_id = target_tenant
  WHERE tenant_id IS NULL OR tenant_id = ghost_id;

  -- system_collections: só os que estavam no fantasma (economia/avaliações
  -- da escola original). Os com tenant_id NULL (verdadeiramente globais,
  -- ex.: pixabayKey) permanecem globais.
  -- 1º) Remover do fantasma as linhas que JÁ existem no tenant alvo
  --     (evita violar a constraint única uniq_settings_doc_tenant).
  DELETE FROM system_collections sc
  USING system_collections sc2
  WHERE sc.tenant_id = ghost_id
    AND sc2.tenant_id = target_tenant
    AND sc.collection_name = sc2.collection_name
    AND sc.doc_id = sc2.doc_id;
  -- 2º) Eliminar duplicatas internas do fantasma (manter 1 por (collection_name,doc_id))
  DELETE FROM system_collections sc
  USING system_collections sc2
  WHERE sc.tenant_id = ghost_id
    AND sc2.tenant_id = ghost_id
    AND sc.collection_name = sc2.collection_name
    AND sc.doc_id = sc2.doc_id
    AND sc.ctid < sc2.ctid;
  -- 3º) Mover as demais linhas do fantasma para o tenant alvo
  UPDATE system_collections SET tenant_id = target_tenant
  WHERE tenant_id = ghost_id;

  -- Tabelas COM is_global:
  --   * tenant_id = fantasma  -> eram locais da escola original -> vão para o alvo (is_global=false)
  --   * tenant_id IS NULL E is_global = true  -> globais verdadeiros -> permanecem globais
  --   * tenant_id IS NULL E is_global != true -> órfãos -> vão para o alvo

  -- store_items
  UPDATE store_items SET tenant_id = target_tenant, is_global = false
  WHERE tenant_id = ghost_id OR (tenant_id IS NULL AND is_global IS DISTINCT FROM true);

  -- custom_ranks
  UPDATE custom_ranks SET tenant_id = target_tenant, is_global = false
  WHERE tenant_id = ghost_id OR (tenant_id IS NULL AND is_global IS DISTINCT FROM true);

  -- 3d_models
  UPDATE "3d_models" SET tenant_id = target_tenant, is_global = false
  WHERE tenant_id = ghost_id OR (tenant_id IS NULL AND is_global IS DISTINCT FROM true);

  -- preset_skins
  UPDATE preset_skins SET tenant_id = target_tenant, is_global = false
  WHERE tenant_id = ghost_id OR (tenant_id IS NULL AND is_global IS DISTINCT FROM true);

  -- 3) RECONSTRUIR TENANT_USERS DE FORMA CONSISTENTE
  -- Para todo usuário, garantir pelo menos uma linha em tenant_users
  -- apontando para o tenant que está em users.tenant_id.
  INSERT INTO tenant_users (tenant_id, user_id, role)
  SELECT
    u.tenant_id,
    u.id,
    CASE
      WHEN u.role IN ('admin','teacher','coordinator','superadmin') THEN u.role
      ELSE 'student'
    END
  FROM users u
  WHERE u.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = u.tenant_id AND tu.user_id = u.id
    )
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- Corrigir linhas antigas de tenant_users que apontam para o fantasma,
  -- movendo-as para o tenant principal do usuário.
  UPDATE tenant_users tu
  SET tenant_id = u.tenant_id
  FROM users u
  WHERE tu.user_id = u.id
    AND tu.tenant_id = ghost_id
    AND u.tenant_id IS NOT NULL
    AND u.tenant_id <> ghost_id
    AND NOT EXISTS (
      SELECT 1 FROM tenant_users tu2
      WHERE tu2.user_id = u.id AND tu2.tenant_id = u.tenant_id
    );

  -- Remover linhas de tenant_users do fantasma que sobraram (agora sem
  -- usuário válido apontando para ele).
  DELETE FROM tenant_users WHERE tenant_id = ghost_id;

  -- 4) DESATIVAR O TENANT FANTASMA
  UPDATE tenants SET status = 'inactive' WHERE id = ghost_id;

  RAISE NOTICE 'Migração de correção de tenants concluída. Tenant alvo: %', target_tenant;
END $do$;

-- 5) RECRIAR FUNÇÃO + TRIGGER AUTO-ASSIGN TENANT_ID
-- Evita novos órfãos: ao inserir com tenant_id NULL, tenta derivar do
-- usuário autenticado via tenant_users.
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

CREATE OR REPLACE FUNCTION auto_assign_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_tenant_id ON users;
CREATE TRIGGER trigger_users_tenant_id
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

DROP TRIGGER IF EXISTS trigger_user_items_tenant_id ON user_items;
CREATE TRIGGER trigger_user_items_tenant_id
  BEFORE INSERT ON user_items
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();

DROP TRIGGER IF EXISTS trigger_xp_logs_tenant_id ON xp_logs;
CREATE TRIGGER trigger_xp_logs_tenant_id
  BEFORE INSERT ON xp_logs
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();