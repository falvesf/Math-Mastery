-- Adiciona políticas de RLS para a tabela pre_authorized_students
-- Execute no SQL Editor do Supabase (após criar a tabela)

ALTER TABLE public.pre_authorized_students ENABLE ROW LEVEL SECURITY;

-- Permite INSERT para usuários autenticados (admin/professor)
CREATE POLICY "pre_auth_insert_authenticated" ON public.pre_authorized_students
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Permite SELECT para usuários autenticados
CREATE POLICY "pre_auth_select_authenticated" ON public.pre_authorized_students
  FOR SELECT TO authenticated
  USING (true);

-- Permite DELETE para usuários autenticados
CREATE POLICY "pre_auth_delete_authenticated" ON public.pre_authorized_students
  FOR DELETE TO authenticated
  USING (true);

-- Permite UPDATE para usuários autenticados
CREATE POLICY "pre_auth_update_authenticated" ON public.pre_authorized_students
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
