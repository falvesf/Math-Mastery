-- ============================================================
-- Tabela coin_logs: histórico de moedas atribuídas/retiradas
-- manualmente pelo professor (modal "Gerenciar ganhos").
-- Espelha a estrutura e o comportamento de xp_logs.
-- ============================================================

CREATE TABLE IF NOT EXISTS coin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  eval_name TEXT,
  justification TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  tenant_id UUID REFERENCES tenants(id)
);

ALTER TABLE coin_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_coin_logs_student_id ON coin_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_coin_logs_tenant_id ON coin_logs(tenant_id);

-- RLS desabilitado (consistente com o fix_disable_rls.sql aplicado no projeto)
ALTER TABLE coin_logs DISABLE ROW LEVEL SECURITY;

-- Trigger para auto-atribuir tenant_id (mesma função usada por xp_logs)
CREATE TRIGGER trigger_coin_logs_tenant_id
  BEFORE INSERT ON coin_logs
  FOR EACH ROW EXECUTE FUNCTION auto_assign_tenant_id();