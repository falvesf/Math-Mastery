-- Adicionar coluna pending_class_name na tabela users (para guardar a turma escolhida pelo aluno pendente)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_class_name TEXT;

-- Verificar
SELECT id, name, email, role, tenant_id, class_id, pending_class_name FROM users WHERE role = 'pending_student' ORDER BY created_at DESC;