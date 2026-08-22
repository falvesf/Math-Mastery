-- ============================================================
-- REVERSÃO: Corrigir inversão causada pela migration_fix_tenant_limbo
-- Problema: a migração anterior tratou o tenant 00000000-...-0001
-- (que é o COLÉGIO ADVENTISTA DE IBIÚNA) como "fantasma" e moveu
-- todos os dados dele para a Escola Teste, desativando o Colégio.
--
-- Esta migração:
--   1. Reativa o Colégio (00000000-...-0001) -> status 'active'
--   2. Move TODOS os dados da Escola Teste de volta para o Colégio
--   3. Reconstrói tenant_users de forma consistente
--   4. Deixa a Escola Teste vazia (como era antes)
--
-- IMPORTANTE: rode UMA VEZ no Supabase SQL Editor.
-- ============================================================
DO $do$

DECLARE
  colegio_id UUID := '00000000-0000-0000-0000-000000000001';
  escola_teste_id UUID;
BEGIN
  -- Descobrir a Escola Teste pelo nome (fallback: id conhecido)
  SELECT id INTO escola_teste_id
  FROM tenants
  WHERE id <> colegio_id AND (name ILIKE '%teste%')
  LIMIT 1;

  IF escola_teste_id IS NULL THEN
    escola_teste_id := '10fe671e-47d3-49fe-9333-c1fba39e7f7e';
  END IF;

  RAISE NOTICE 'Colégio: %  |  Escola Teste: %', colegio_id, escola_teste_id;

  -- 1) REATIVAR O COLÉGIO
  UPDATE tenants SET status = 'active' WHERE id = colegio_id;

  -- 2) MOVER DADOS DA ESCOLA TESTE DE VOLTA PARA O COLÉGIO
  -- Tabelas SEM is_global
  UPDATE users SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE quests SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE classes SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE user_items SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE quest_attempts SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE live_quests SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE xp_logs SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  -- system_collections (evitar violar constraint uniq_settings_doc_tenant)
  -- Remover do Colégio linhas que JÁ existem na Escola Teste (a do Colégio prevalece)
  DELETE FROM system_collections sc
  USING system_collections sc2
  WHERE sc.tenant_id = colegio_id
    AND sc2.tenant_id = escola_teste_id
    AND sc.collection_name = sc2.collection_name
    AND sc.doc_id = sc2.doc_id;
  -- Eliminar duplicatas internas da Escola Teste
  DELETE FROM system_collections sc
  USING system_collections sc2
  WHERE sc.tenant_id = escola_teste_id
    AND sc2.tenant_id = escola_teste_id
    AND sc.collection_name = sc2.collection_name
    AND sc.doc_id = sc2.doc_id
    AND sc.ctid < sc2.ctid;
  -- Mover o restante
  UPDATE system_collections SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  -- Tabelas COM is_global: apenas mover tenant_id (preservar is_global)
  UPDATE store_items SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE custom_ranks SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE "3d_models" SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  UPDATE preset_skins SET tenant_id = colegio_id WHERE tenant_id = escola_teste_id;

  -- 3) RECONSTRUIR TENANT_USERS
  -- Mover linhas da Escola Teste para o Colégio (sem duplicar acessos)
  UPDATE tenant_users tu
  SET tenant_id = colegio_id
  FROM users u
  WHERE tu.user_id = u.id
    AND tu.tenant_id = escola_teste_id
    AND u.tenant_id = colegio_id
    AND NOT EXISTS (
      SELECT 1 FROM tenant_users tu2
      WHERE tu2.user_id = u.id AND tu2.tenant_id = colegio_id
    );

  -- Remover linhas restantes da Escola Teste
  DELETE FROM tenant_users WHERE tenant_id = escola_teste_id;

  -- Garantir linha tenant_users para todo usuário do Colégio
  INSERT INTO tenant_users (tenant_id, user_id, role)
  SELECT
    u.tenant_id,
    u.id,
    CASE
      WHEN u.role IN ('admin','teacher','coordinator','superadmin') THEN u.role
      ELSE 'student'
    END
  FROM users u
  WHERE u.tenant_id = colegio_id
    AND NOT EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.tenant_id = colegio_id AND tu.user_id = u.id
    )
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RAISE NOTICE 'Reversão concluída. Escola Teste agora está vazia: %', escola_teste_id;
END $do$;