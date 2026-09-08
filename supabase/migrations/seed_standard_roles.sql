-- ============================================================
-- SEED: Funções padrão + permissões (RBAC)
-- Cria as tabelas (se não existirem) e insere as funções
-- Administrador, Coordenador, Professor e Aluno para CADA escola
-- (e uma cópia global), com as permissões atuais de cada função.
-- Execute no SQL Editor do Supabase (pode rodar mais de uma vez — é idempotente).
-- ============================================================

-- 1) Tabelas (idempotente)
CREATE TABLE IF NOT EXISTS public.roles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  tenant_id text,
  is_system boolean DEFAULT false,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id text PRIMARY KEY,
  role_id text NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  area text NOT NULL,
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_update boolean DEFAULT false,
  can_delete boolean DEFAULT false
);

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

-- 2) Funções padrão por escola + global
INSERT INTO public.roles (id, name, description, tenant_id, is_system, created_at)
SELECT 'role_admin_' || COALESCE(LEFT(replace(t.id::text, '-', ''), 8), 'global'), 'Administrador', 'Função padrão: Administrador', t.id, true, now()
FROM (SELECT id FROM public.tenants UNION ALL SELECT NULL::uuid) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name, description, tenant_id, is_system, created_at)
SELECT 'role_coordinator_' || COALESCE(LEFT(replace(t.id::text, '-', ''), 8), 'global'), 'Coordenador', 'Função padrão: Coordenador', t.id, true, now()
FROM (SELECT id FROM public.tenants UNION ALL SELECT NULL::uuid) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name, description, tenant_id, is_system, created_at)
SELECT 'role_teacher_' || COALESCE(LEFT(replace(t.id::text, '-', ''), 8), 'global'), 'Professor', 'Função padrão: Professor', t.id, true, now()
FROM (SELECT id FROM public.tenants UNION ALL SELECT NULL::uuid) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name, description, tenant_id, is_system, created_at)
SELECT 'role_student_' || COALESCE(LEFT(replace(t.id::text, '-', ''), 8), 'global'), 'Aluno', 'Função padrão: Aluno', t.id, true, now()
FROM (SELECT id FROM public.tenants UNION ALL SELECT NULL::uuid) t
ON CONFLICT (id) DO NOTHING;

-- 3) + 4) Áreas e permissões em UM único INSERT (CTE vale para todo o statement)
WITH areas(area) AS (
  VALUES
    ('quests'),('profile'),('ranking'),('store'),('inventory'),
    ('users'),('quests_admin'),('items'),('economy'),('classes'),
    ('approvals'),('config'),('ranks'),('entities'),('models'),
    ('skins'),('debug3d'),('pre_authorized'),('tenants'),('companion')
),
perms AS (
  -- ADMINISTRADOR: todas as áreas com todos os direitos
  SELECT r.id AS role_id, a.area,
         true AS can_view, true AS can_create, true AS can_update, true AS can_delete
  FROM public.roles r CROSS JOIN areas a WHERE r.name = 'Administrador'
  UNION ALL
  -- COORDENADOR: tudo, menos Escolas e Companheiro
  SELECT r.id AS role_id, a.area,
         (a.area NOT IN ('tenants','companion')) AS can_view,
         (a.area NOT IN ('tenants','companion')) AS can_create,
         (a.area NOT IN ('tenants','companion')) AS can_update,
         (a.area NOT IN ('tenants','companion')) AS can_delete
  FROM public.roles r CROSS JOIN areas a WHERE r.name = 'Coordenador'
  UNION ALL
  -- PROFESSOR: dashboard completo + missões/itens; leitura em alunos/turmas/solicitações/patentes/entidades; resto sem acesso
  SELECT r.id AS role_id, a.area,
         CASE
           WHEN a.area IN ('quests','profile','ranking','store','inventory','quests_admin','items') THEN true
           WHEN a.area IN ('users','classes','approvals','ranks','entities','models','skins','pre_authorized') THEN true
           ELSE false
         END AS can_view,
         CASE WHEN a.area IN ('quests','profile','ranking','store','inventory','quests_admin','items') THEN true ELSE false END AS can_create,
         CASE WHEN a.area IN ('quests','profile','ranking','store','inventory','quests_admin','items') THEN true ELSE false END AS can_update,
         CASE WHEN a.area IN ('quests','profile','ranking','store','inventory','quests_admin','items') THEN true ELSE false END AS can_delete
  FROM public.roles r CROSS JOIN areas a WHERE r.name = 'Professor'
  UNION ALL
  -- ALUNO: painel do aluno com leitura; personagem com edição; resto sem acesso
  SELECT r.id AS role_id, a.area,
         (a.area IN ('quests','profile','ranking','store','inventory')) AS can_view,
         (a.area = 'profile') AS can_create,
         (a.area = 'profile') AS can_update,
         (a.area = 'profile') AS can_delete
  FROM public.roles r CROSS JOIN areas a WHERE r.name = 'Aluno'
)
INSERT INTO public.role_permissions (id, role_id, area, can_view, can_create, can_update, can_delete)
SELECT role_id || '_' || area, role_id, area, can_view, can_create, can_update, can_delete FROM perms
ON CONFLICT (id) DO UPDATE SET can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_update=EXCLUDED.can_update, can_delete=EXCLUDED.can_delete;

-- 5) Verificação
SELECT r.name, r.tenant_id, COUNT(p.id) AS permissoes
FROM public.roles r
LEFT JOIN public.role_permissions p ON p.role_id = r.id
WHERE r.is_system = true
GROUP BY r.name, r.tenant_id
ORDER BY r.name;