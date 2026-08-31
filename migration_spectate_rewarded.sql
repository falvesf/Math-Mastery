-- Recompensa de espectador: campo direto no banco.
-- 0 = nunca assistiu uma luta completa em modo espectador (pode receber a recompensa grande).
-- 1 = já recebeu a recompensa grande (só recebe as recompensas menores de 0,25% da aposta).
-- RODE ESTE SQL NO SUPABASE (SQL Editor).

ALTER TABLE users ADD COLUMN IF NOT EXISTS spectate_rewarded INTEGER NOT NULL DEFAULT 0;

-- Migra quem já recebeu a recompensa (legado em inventory_preferences ou system_collections)
-- para não receber a recompensa grande de novo.
UPDATE users u SET spectate_rewarded = 1
WHERE COALESCE((u.inventory_preferences->>'firstSpectateRewarded')::boolean, false) = true
   OR EXISTS (
     SELECT 1 FROM system_collections s
     WHERE s.collection_name = 'spectate_rewards' AND s.doc_id = u.id::text
       AND COALESCE((s.data->>'firstRewarded')::boolean, false) = true
   );