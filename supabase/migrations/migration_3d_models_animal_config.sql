-- ============================================================
-- MIGRAÇÃO: Atributos & Drops dos ANIMAIS (Moldes 3D → Animais)
-- Adiciona uma coluna JSONB "config" em "3d_models" para guardar:
--   stats  -> { level, hp, attack, defense, evasion, critChance, xp,
--               fleeChanceTable[], hostileChance, damageEffect }
--   drops  -> [{ itemId, dropChance, min, max }]
--   biography, quotes, sons extras etc. (mesmo formato dos monstros)
-- ============================================================

ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Verificação
SELECT id, name, category, kind, config FROM "3d_models" WHERE category = 'animal' LIMIT 20;
