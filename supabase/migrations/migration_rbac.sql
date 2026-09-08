-- ============================================================
-- MIGRAÇÃO: RBAC — Hierarquias e Permissões por função
-- Tabelas: roles, role_permissions, user_roles
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Funções (papéis). tenant_id null = global (todas as escolas).
CREATE TABLE IF NOT EXISTS public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  tenant_id text,
  is_system boolean DEFAULT false,
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- Permissões por área (ver/criar/editar/excluir)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id text PRIMARY KEY,
  role_id text NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  area text NOT NULL,
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_update boolean DEFAULT false,
  can_delete boolean DEFAULT false
);

-- Vínculo usuário ↔ função
CREATE TABLE IF NOT EXISTS public.user_roles (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  role_id text NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  tenant_id text,
  UNIQUE (user_id, role_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles(tenant_id);

-- Verificação
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('roles','role_permissions','user_roles');