-- ============================================================
-- Adiciona restrição de domínio de e-mail por escola (tenant)
-- ------------------------------------------------------------
-- `allowed_email_domain` define quais contas podem se matricular
-- na escola. Exemplos:
--   - 'escola.edu.br' -> só contas @escola.edu.br entram
--   - NULL / ''       -> sem restrição (qualquer conta Google)
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allowed_email_domain TEXT;