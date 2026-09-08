-- ============================================================
-- MIGRAÇÃO DE REPARO: MOVER ALUNO "SUMIDO" PARA A ESCOLA CORRETA
--
-- COMO USAR:
--   1. Rode primeiro o migration_diagnose_limbo_users.sql para
--      confirmar o NOME exato do aluno e o id da escola correta.
--   2. Substitua abaixo:
--        :student_name -> nome completo do aluno (ex: 'João da Silva')
--        :school_id    -> id da escola correta (UUID)
--        :correct_class-> turma correta (ex: '9º ano') — deixe '' se não quiser alterar
--   3. Rode este script UMA VEZ no Supabase SQL Editor.
-- ============================================================
DO $do$
DECLARE
  v_user_id UUID;
  v_school_id UUID := ':school_id';
  v_class TEXT := ':correct_class';
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE name = ':student_name' LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Aluno não encontrado com o nome informado.';
    RETURN;
  END IF;

  -- 1) Corrigir users.tenant_id para a escola correta
  UPDATE public.users SET tenant_id = v_school_id WHERE id = v_user_id;

  -- 2) Garantir acesso (tenant_users) à escola correta
  INSERT INTO public.tenant_users (tenant_id, user_id, role)
  VALUES (v_school_id, v_user_id, 'student')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- 3) Remover acesso às OUTRAS escolas (evita aparecer em mais de uma)
  DELETE FROM public.tenant_users WHERE user_id = v_user_id AND tenant_id <> v_school_id;

  -- 4) Corrigir a turma (se informada)
  IF v_class <> '' THEN
    UPDATE public.users SET class_id = v_class WHERE id = v_user_id;
  END IF;

  RAISE NOTICE 'Aluno % (nome %) movido para a escola %', v_user_id, ':student_name', v_school_id;
END $do$;

-- Diagnóstico pós-reparo
SELECT id, name, email, role, class_id, tenant_id FROM public.users WHERE name = ':student_name' LIMIT 1;