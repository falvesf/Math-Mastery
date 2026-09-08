-- ============================================================
-- GUARDAS DE INTEGRIDADE em user_items (defense-in-depth, SEM RLS)
-- Rode manualmente no Supabase SQL Editor.
--
-- Fecham a adulteração via console do navegador para ITENS:
--  1) forgeLevel só pode ser alterado pela Forja/Transmutação (RPC
--     SECURITY DEFINER) — bloquear o exploit "setar +9 na mão";
--  2) baseAttributeValue não muda após a compra (só via RPC/admin)
--     — bloqueia "item com poder 999999";
--  3) ninguém pode DELETAR itens de outro usuário pelo cliente
--     — protege contra corrupção cruzada de dados da turma.
--
-- COMO FUNCIONA (sem RLS):
--  - Operações vindas do NAVEGADOR rodam com current_user = 'authenticated'
--    (ou 'anon') → as guardas são aplicadas.
--  - Operações via RPC SECURITY DEFINER (forge/transmute/pvp/coin) rodam
--    como o DONO da função (ex.: 'postgres') → passam direto.
--  - Migrações no SQL Editor (role postgres) passam direto.
--  - Admins (superadmin/admin/teacher) passam direto.
--
-- OBS: moedas/XP (users) ainda podem ser alteradas pelo console.
-- Fechar isso exige mover a economia do bazar/missões-live para RPCs
-- primeiro (refatoração dedicada).
-- ============================================================

-- ============================================================
-- Guarda de UPDATE em user_items
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_user_items_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
BEGIN
  -- Operações do servidor (RPCs security definer / migrações) passam
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Admins passam
  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM users WHERE id = v_uid AND role IN ('superadmin', 'admin', 'teacher')
    ) INTO v_admin;
    IF v_admin THEN
      RETURN NEW;
    END IF;
  END IF;

  -- forgeLevel: só a Forja/Transmutação (RPC security definer) altera
  IF COALESCE((NEW.data->>'forgeLevel')::int, 0) <> COALESCE((OLD.data->>'forgeLevel')::int, 0) THEN
    RAISE EXCEPTION 'forgeLevel só pode ser alterado pela Forja/Transmutação (RPC)';
  END IF;

  -- baseAttributeValue: estático após a compra (só RPC/admin altera)
  IF COALESCE((NEW.data->>'baseAttributeValue')::numeric, 0) <> COALESCE((OLD.data->>'baseAttributeValue')::numeric, 0) THEN
    RAISE EXCEPTION 'poder base do item não pode ser alterado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_items_guard_update ON public.user_items;
CREATE TRIGGER trg_user_items_guard_update
BEFORE UPDATE ON public.user_items
FOR EACH ROW EXECUTE FUNCTION public.guard_user_items_update();

-- ============================================================
-- Guarda de DELETE em user_items
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_user_items_delete() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
BEGIN
  -- Operações do servidor passam
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;

  -- Admins passam
  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM users WHERE id = v_uid AND role IN ('superadmin', 'admin', 'teacher')
    ) INTO v_admin;
    IF v_admin THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Só o dono pode excluir o próprio item
  IF OLD.student_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'não é permitido excluir itens de outro usuário';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_items_guard_delete ON public.user_items;
CREATE TRIGGER trg_user_items_guard_delete
BEFORE DELETE ON public.user_items
FOR EACH ROW EXECUTE FUNCTION public.guard_user_items_delete();