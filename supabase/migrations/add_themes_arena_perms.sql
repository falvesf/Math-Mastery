-- ============================================================
-- Adiciona as áreas Temas e Arena Debug às funções existentes
-- (idempotente — pode rodar mais de uma vez)
-- Execute no SQL Editor do Supabase
-- ============================================================

WITH areas(area) AS (
  VALUES ('themes'), ('arena_debug')
),
perms AS (
  SELECT r.id AS role_id, a.area,
    CASE
      WHEN r.name IN ('Administrador','Coordenador','Professor') THEN true
      WHEN r.name = 'Aluno' THEN (a.area = 'themes')
      ELSE false
    END AS can_view,
    CASE
      WHEN r.name = 'Administrador' THEN true
      WHEN r.name IN ('Coordenador','Professor') THEN (a.area = 'themes')
      ELSE false
    END AS can_create,
    CASE
      WHEN r.name = 'Administrador' THEN true
      WHEN r.name IN ('Coordenador','Professor') THEN (a.area = 'themes')
      ELSE false
    END AS can_update,
    CASE
      WHEN r.name = 'Administrador' THEN true
      WHEN r.name IN ('Coordenador','Professor') THEN (a.area = 'themes')
      ELSE false
    END AS can_delete
  FROM public.roles r CROSS JOIN areas a
  WHERE r.is_system = true
)
INSERT INTO public.role_permissions (id, role_id, area, can_view, can_create, can_update, can_delete)
SELECT role_id || '_' || area, role_id, area, can_view, can_create, can_update, can_delete FROM perms
ON CONFLICT (id) DO UPDATE SET can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_update=EXCLUDED.can_update, can_delete=EXCLUDED.can_delete;

-- Verificação
SELECT r.name, p.area, p.can_view, p.can_create, p.can_update, p.can_delete
FROM public.roles r
JOIN public.role_permissions p ON p.role_id = r.id
WHERE p.area IN ('themes','arena_debug')
ORDER BY r.name, p.area;