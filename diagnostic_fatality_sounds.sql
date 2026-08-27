-- ============================================================
-- DIAGNÓSTICO: Sons de Fatalidade
-- Rode no SQL Editor do Supabase e cole o resultado aqui.
-- ============================================================

-- 1) O documento battle_sounds (onde ficam os sons de batalha/fatalidade)
SELECT
  id,
  tenant_id,
  data->>'victory'   AS victory,
  data->>'deathMale' AS deathMale,
  data->>'deathFemale' AS deathFemale,
  data->>'fail'      AS fail,
  data->>'punch'     AS punch,
  data->>'fatalFall' AS fatalFall,
  data->>'fatalEvaporate' AS fatalEvaporate,
  data->>'fatalSlice' AS fatalSlice,
  data->>'fatalExplode' AS fatalExplode
FROM system_collections
WHERE collection_name = 'audio' AND doc_id = 'battle_sounds'
ORDER BY id;

-- 2) Sons de áudio cadastrados (para o fallback por nome)
SELECT id, name, category, gender, url
FROM audio_bank
WHERE name ILIKE '%fatal%'
   OR name ILIKE '%queda%' OR name ILIKE '%fall%'
   OR name ILIKE '%evapor%' OR name ILIKE '%pulver%'
   OR name ILIKE '%corte%' OR name ILIKE '%slice%' OR name ILIKE '%lamina%' OR name ILIKE '%espada%'
   OR name ILIKE '%explos%' OR name ILIKE '%bomba%'
ORDER BY name;