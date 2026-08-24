-- ============================================================
-- LOGIN HÍBRIDO: Contas Locais (criadas pelo administrador)
-- ------------------------------------------------------------
-- Permite contas locais (usuário + senha gerada) para escolas cujo
-- domínio institucional bloqueia o Google OAuth. O admin cria a conta
-- por tenant; o usuário loga com usuário/e-mail + senha e, no 1º acesso,
-- é OBRIGADO a trocar a senha para continuar.
--
-- Componentes:
--   1. extensão pgcrypto (crypt/gen_salt)
--   2. tabela local_accounts
--   3. RPC create_local_account  (admin cria auth user + users + tenant)
--   4. RPC verify_local_login     (valida credenciais antes do sign-in)
--   5. RPC change_local_password  (troca forçada no 1º acesso)
--   6. RLS policies em local_accounts
-- ============================================================

-- pgcrypto fornece crypt()/gen_salt() (bcrypt). No Supabase fica no schema extensions.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Remove TODAS as versões anteriores das funções (evita overloads que confundem o PostgREST)
DROP FUNCTION IF EXISTS public.create_local_account_profile(uuid, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_local_account(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_local_account(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_local_account(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_local_account(uuid, text);
DROP FUNCTION IF EXISTS public.create_local_account(uuid, text, text);
DROP FUNCTION IF EXISTS public.verify_local_login(text, text);
DROP FUNCTION IF EXISTS public.change_local_password(text, text, text);
DROP FUNCTION IF EXISTS public.change_local_password(uuid, text, text);
DROP FUNCTION IF EXISTS public.reset_local_password(uuid, text);
DROP FUNCTION IF EXISTS public.reset_local_password(uuid);

-- ------------------------------------------------------------
-- 1) TABELA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.local_accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  username text NOT NULL,
  auth_email text NOT NULL UNIQUE,
  email text,
  phone text,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_password_change_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS local_accounts_username_lower_idx
  ON public.local_accounts (lower(username));

-- ------------------------------------------------------------
-- 2) RPC: FINALIZAR CONTA LOCAL (admin/superadmin)
-- O auth user é criado pelo CLIENTE via supabase.auth.signUp (garante
-- que o signInWithPassword funcione). Esta função apenas confirma o
-- e-mail, cria users/tenant_users/local_accounts e grava o hash.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_local_account_profile(
  p_auth_user_id uuid,
  p_tenant_id uuid,
  p_username text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_class_name text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_username text := lower(btrim(p_username));
  v_auth_email text;
  v_existing uuid;
BEGIN
  -- Apenas superadmin/admin podem criar contas locais
  IF v_caller IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_caller AND role IN ('superadmin','admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar contas locais';
  END IF;

  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION 'Nome de usuário é obrigatório';
  END IF;

  SELECT id INTO v_existing FROM public.local_accounts WHERE lower(username) = v_username;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Este nome de usuário já está em uso';
  END IF;

  SELECT email INTO v_auth_email FROM auth.users WHERE id = p_auth_user_id;
  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Usuário de autenticação não encontrado';
  END IF;

  -- Garante a conta confirmada (cobre projetos com "Confirm email" ligado)
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      phone_confirmed_at = COALESCE(phone_confirmed_at, now())
  WHERE id = p_auth_user_id;

  -- users (o trigger handle_new_user pode já ter criado a linha; faz upsert)
  INSERT INTO public.users (id, email, name, role, tenant_id, class_id, xp, coins, hp)
  VALUES (p_auth_user_id, v_auth_email, v_username, 'student', p_tenant_id, p_class_name, 0, 0, 3)
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    role = 'student',
    tenant_id = excluded.tenant_id,
    class_id = excluded.class_id;

  -- Vínculo inicial com o tenant
  INSERT INTO public.tenant_users (tenant_id, user_id, role)
  VALUES (p_tenant_id, p_auth_user_id, 'student')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- Conta local
  INSERT INTO public.local_accounts (id, tenant_id, username, auth_email, email, phone, password_hash, must_change_password, created_by)
  VALUES (
    p_auth_user_id,
    p_tenant_id,
    v_username,
    v_auth_email,
    nullif(btrim(coalesce(p_email, '')), ''),
    p_phone,
    encode(digest(p_password, 'sha256'), 'hex'),
    true,
    v_caller
  );

  RETURN jsonb_build_object('id', p_auth_user_id, 'username', v_username, 'auth_email', v_auth_email, 'password', p_password);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_local_account_profile(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_local_account_profile(uuid, uuid, text, text, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- 3) RPC: VALIDAR LOGIN LOCAL (verifica usuário/e-mail + senha)
-- Retorna se a senha precisa ser trocada no primeiro acesso.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_local_login(p_identifier text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_acc public.local_accounts;
BEGIN
  SELECT * INTO v_acc FROM public.local_accounts
  WHERE lower(username) = lower(btrim(p_identifier))
     OR email = lower(btrim(p_identifier))
     OR auth_email = lower(btrim(p_identifier))
  LIMIT 1;

  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada. Verifique seu usuário/e-mail.';
  END IF;

  IF v_acc.status <> 'active' THEN
    RAISE EXCEPTION 'Conta desativada. Contate o administrador.';
  END IF;

  IF v_acc.password_hash <> encode(digest(coalesce(p_password, ''), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Senha incorreta.';
  END IF;

  RETURN jsonb_build_object(
    'id', v_acc.id,
    'username', v_acc.username,
    'auth_email', v_acc.auth_email,
    'must_change_password', v_acc.must_change_password,
    'tenant_id', v_acc.tenant_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_local_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_local_login(text, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) RPC: TROCA DE SENHA (obrigatória no 1º acesso)
-- Recebe o id da conta (retornado pelo verify_local_login) para
-- localização determinística.
-- ------------------------------------------------------------
-- Remove a assinatura antiga (text,text,text) para não conflitar
-- com a nova (uuid,text,text) no cache do PostgREST.
DROP FUNCTION IF EXISTS public.change_local_password(text, text, text);
DROP FUNCTION IF EXISTS public.change_local_password(uuid, text, text);

CREATE OR REPLACE FUNCTION public.change_local_password(
  p_account_id uuid,
  p_current_password text,
  p_new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_acc public.local_accounts;
BEGIN
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter no mínimo 6 caracteres';
  END IF;

  SELECT * INTO v_acc FROM public.local_accounts WHERE id = p_account_id;

  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;

  IF v_acc.password_hash IS DISTINCT FROM encode(digest(coalesce(p_current_password, ''), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Senha atual incorreta.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_acc.id;

  UPDATE public.local_accounts
  SET password_hash = encode(digest(p_new_password, 'sha256'), 'hex'),
      must_change_password = false,
      last_password_change_at = now()
  WHERE id = v_acc.id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_local_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_local_password(uuid, text, text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5) RPC: REDEFINIR SENHA (admin/superadmin)
-- Gera uma nova senha, marca must_change_password=true (o usuário
-- é obrigado a trocar no próximo acesso) e devolve a senha gerada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_local_password(
  p_account_id uuid,
  p_new_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_acc public.local_accounts;
  v_password text;
BEGIN
  -- Apenas superadmin/admin podem redefinir senha de conta local
  IF v_caller IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_caller AND role IN ('superadmin','admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para redefinir senha';
  END IF;

  SELECT * INTO v_acc FROM public.local_accounts WHERE id = p_account_id;
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Conta local não encontrada.';
  END IF;

  v_password := coalesce(p_new_password, substr(md5(random()::text || clock_timestamp()::text || p_account_id::text), 1, 12));

  UPDATE auth.users
  SET encrypted_password = crypt(v_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_acc.id;

  UPDATE public.local_accounts
  SET password_hash = encode(digest(v_password, 'sha256'), 'hex'),
      must_change_password = true,
      last_password_change_at = NULL
  WHERE id = v_acc.id;

  RETURN jsonb_build_object('id', v_acc.id, 'username', v_acc.username, 'auth_email', v_acc.auth_email, 'password', v_password);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_local_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_local_password(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 6) RPC: EXCLUIR CONTA LOCAL (admin/superadmin)
-- Remove local_accounts, users, tenant_users e o auth user (limpeza).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_local_account(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_acc public.local_accounts;
BEGIN
  IF v_caller IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_caller AND role IN ('superadmin','admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir conta local';
  END IF;

  SELECT * INTO v_acc FROM public.local_accounts WHERE id = p_account_id;
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Conta local não encontrada.';
  END IF;

  DELETE FROM public.local_accounts WHERE id = p_account_id;
  DELETE FROM public.tenant_users WHERE user_id = p_account_id;
  DELETE FROM public.users WHERE id = p_account_id;
  DELETE FROM auth.identities WHERE user_id = p_account_id;
  DELETE FROM auth.users WHERE id = p_account_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_local_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_local_account(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5) RLS EM local_accounts
-- ------------------------------------------------------------
ALTER TABLE public.local_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "local_accounts_select" ON public.local_accounts;
CREATE POLICY "local_accounts_select" ON public.local_accounts
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid() AND tu.tenant_id = local_accounts.tenant_id
    )
  );

DROP POLICY IF EXISTS "local_accounts_update" ON public.local_accounts;
CREATE POLICY "local_accounts_update" ON public.local_accounts
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid() AND tu.tenant_id = local_accounts.tenant_id
    )
  );

-- Diagnóstico das funções RPC (devem listar as 4 funções)
SELECT p.proname AS funcao, pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_local_account_profile','verify_local_login','change_local_password','reset_local_password')
ORDER BY p.proname;

-- IMPORTANTE: change_local_password deve aparecer APENAS com (uuid, text, text).
-- Se aparecer também (text, text, text), rode manualmente:
--   DROP FUNCTION IF EXISTS public.change_local_password(text, text, text);

-- Quem pode executar change_local_password (deve ter anon e authenticated)
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'change_local_password'
ORDER BY grantee;

-- Recarrega o cache do PostgREST para expor as funções RPC recém-criadas
-- (evita "Database error querying schema" ao chamar change_local_password etc.)
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Diagnóstico
SELECT id, tenant_id, username, auth_email, must_change_password,
       left(password_hash, 12) AS hash_inicio,
       length(password_hash) AS hash_tamanho
FROM public.local_accounts
LIMIT 50;

-- Diagnóstico do auth.users (como o GoAuth consulta no login por senha)
-- confirmed_at NÃO pode ser NULL para o signInWithPassword funcionar.
SELECT u.id, u.email, u.aud, u.role,
       (u.raw_app_meta_data->>'provider') AS provider,
       u.email_confirmed_at IS NOT NULL AS email_confirmado,
       u.confirmed_at IS NOT NULL AS confirmado_gerado,
       left(u.encrypted_password, 7) AS bcrypt_prefix
FROM public.local_accounts la
JOIN auth.users u ON u.id = la.id
LIMIT 50;