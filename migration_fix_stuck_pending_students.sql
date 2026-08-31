-- Corrige alunos "presos" a uma escola auto-atribuída (fallback da primeira escola).
-- Sincroniza users.tenant_id para a escola que consta em tenant_users (acesso real).
-- Rode no Supabase SQL Editor.

update users u
set tenant_id = tu.tenant_id
from (
  select user_id, tenant_id
  from tenant_users
  where role in ('student', 'pending_student')
  group by user_id, tenant_id
  having count(*) = 1
) tu
where u.id = tu.user_id
  and u.role in ('student', 'pending_student')
  and u.tenant_id is distinct from tu.tenant_id;

-- Diagnóstico: lista alunos sem acesso em tenant_users (precisam reescolher a escola)
-- select id, email, name, role, tenant_id, class_id from users
-- where role in ('student','pending_student')
--   and not exists (select 1 from tenant_users tu where tu.user_id = users.id);