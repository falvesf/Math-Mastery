-- ============================================================
-- MIGRAÇÃO: LICENÇA DO RANCHO
-- Desbloqueia o rancho para o aluno. Enquanto ranch_unlocked = false,
-- os itens do rancho (type = 'ranch') ficam OCULTOS na loja e na mochila
-- e a guia "Rancho" não é exibida. A licença é um item consumível com
-- gameEffect = 'ranch_license'; ao ser usada, marca ranch_unlocked = true.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS ranch_unlocked BOOLEAN DEFAULT false;
