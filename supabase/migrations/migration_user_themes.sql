-- Migration: Tabela de Temas Pessoais do Usuário
-- Cada usuário pode ter até 10 temas pessoais
-- Admins/Teachers podem marcar temas como globais

CREATE TABLE IF NOT EXISTS user_themes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id UUID,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_themes_user ON user_themes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_themes_global ON user_themes(is_global) WHERE is_global = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_themes_tenant ON user_themes(tenant_id);

-- RLS desabilitado (padrão do projeto)
ALTER TABLE user_themes DISABLE ROW LEVEL SECURITY;
