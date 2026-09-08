-- ============================================================
-- SISTEMA DE PRÉ-AUTORIZAÇÃO DE ALUNOS
-- Data: 2026-08-20
-- ============================================================

-- 1. Tabela de alunos pré-autorizados
CREATE TABLE IF NOT EXISTS pre_authorized_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  grade TEXT,
  imported_from TEXT DEFAULT 'manual',
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pre_auth_tenant ON pre_authorized_students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_name ON pre_authorized_students(name);
CREATE INDEX IF NOT EXISTS idx_pre_auth_class ON pre_authorized_students(class_name);

-- 2. Tabela de solicitações de matrícula
CREATE TABLE IF NOT EXISTS enrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  auto_approved BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_enrollment_user ON enrollment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_tenant ON enrollment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_status ON enrollment_requests(status);

-- 3. Adicionar coluna class_name na tabela classes (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'class_name') THEN
    ALTER TABLE classes ADD COLUMN class_name TEXT;
  END IF;
END $$;

-- 4. Verificar sucesso
DO $$
BEGIN
  RAISE NOTICE '=== Sistema de Pré-autorização criado com sucesso ===';
  RAISE NOTICE 'pre_authorized_students: Alunos pré-autorizados por escola';
  RAISE NOTICE 'enrollment_requests: Solicitações de matrícula pendentes';
END $$;
