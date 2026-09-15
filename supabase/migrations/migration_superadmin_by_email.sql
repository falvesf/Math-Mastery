-- ============================================================
-- Reconhece o SUPERADMIN por E-MAIL no banco (is_superadmin()).
-- Rode manualmente no Supabase SQL Editor.
--
-- PROBLEMA: o front identifica o superadmin pelo e-mail mestre
--   fabio.feitoza@eaportal.org (o role do usuário é 'admin'), mas a
--   função is_superadmin() só checava role = 'superadmin'. Resultado:
--   todas as políticas que usam is_superadmin() (store_items, tenants,
--   models, skins...) NÃO davam acesso ao superadmin — os UPDATEs
--   batiam em 0 linhas SEM erro (ex.: editar o preço de um item salvava
--   mas não alterava nada).
--
-- SOLUÇÃO: is_superadmin() passa a reconhecer o role 'superadmin' OU
--   o e-mail mestre (case-insensitive).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (
        role = 'superadmin'
        OR lower(coalesce(email, '')) = 'fabio.feitoza@eaportal.org'
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;