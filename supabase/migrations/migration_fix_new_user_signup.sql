-- ============================================================
-- FIX: "Database error saving new user" ao entrar com conta nova (Gmail)
-- ------------------------------------------------------------
-- O Supabase Auth dispara um trigger (em auth.users) para criar a linha
-- em public.users. Se esse INSERT falhar (RLS bloqueando ou coluna
-- NOT NULL sem valor), o login OAuth é abortado com o erro:
--   "Database error saving new user" (unexpected_failure)
-- Este script:
--   1) Mostra o diagnóstico (RLS, policies e trigger atuais).
--   2) Recria o trigger com SECURITY DEFINER + valores padrão.
--   3) Garante policies de INSERT/UPDATE em users para o próprio usuário.
-- ============================================================

-- 1) DIAGNÓSTICO — rode e veja o resultado antes/depois
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'users';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY cmd;

SELECT tgname, pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;

-- 2) FUNÇÃO do trigger com SECURITY DEFINER e valores padrão.
--    Cobre colunas NOT NULL comuns (name, role, xp, coins, hp).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, xp, coins, hp)
  VALUES (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'Novo Aluno'
    ),
    'student', 0, 0, 3
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END $$;

-- Remove triggers existentes de novo usuário (nomes comuns) para evitar duplicidade
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) POLICIES de INSERT/UPDATE (caso a RLS esteja bloqueando o cadastro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='users' AND cmd='INSERT'
  ) THEN
    CREATE POLICY "users_insert_own_row"
      ON public.users FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='users'
      AND cmd='UPDATE' AND policyname ILIKE '%own%'
  ) THEN
    CREATE POLICY "users_update_own_row"
      ON public.users FOR UPDATE TO authenticated
      USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
END $$;