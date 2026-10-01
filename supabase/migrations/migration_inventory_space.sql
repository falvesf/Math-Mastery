-- ============================================================
-- MIGRAÇÃO: AUMENTO DE ESPAÇO NA MOCHILA
-- Effect consumível `inventory_space`:
--   - permanece: soma em users.extra_inventory_space (permanente);
--   - temporário: soma em users.inventory_space_buff com validade
--     (inventory_space_buff_until) — 3, 5, 7, 10, 12, 15, 30 ou 60 dias.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS inventory_space_buff INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inventory_space_buff_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inventory_space_buff_days INT DEFAULT 0;