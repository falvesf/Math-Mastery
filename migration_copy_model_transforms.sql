-- ============================================================
-- Corrige itens de loja IMPORTADOS que perderam o modelTransforms
-- (Debug 3D) na cópia global -> local.
-- 1) Copia o modelTransforms do item GLOBAL para as cópias LOCAIS
--    que vieram dele (data.importedFromId = id do global).
-- 2) Atualiza também os itens já comprados (user_items) que estão
--    sem modelTransforms, puxando do item de loja corrigido.
-- ============================================================

-- 1) Itens locais da loja (cópias de globais) sem modelTransforms
UPDATE store_items local_item
SET data = jsonb_set(
  local_item.data,
  '{modelTransforms}',
  global_item.data->'modelTransforms',
  true
)
FROM store_items global_item
WHERE local_item.is_global = false
  AND local_item.data->>'importedFromId' IS NOT NULL
  AND local_item.data->'modelTransforms' IS NULL
  AND global_item.is_global = true
  AND global_item.id = (local_item.data->>'importedFromId')::uuid
  AND global_item.data->'modelTransforms' IS NOT NULL;

-- 2) Itens já comprados (user_items) sem modelTransforms,
--    puxando do item de loja corrigido
UPDATE user_items ui
SET data = jsonb_set(
  ui.data,
  '{modelTransforms}',
  si.data->'modelTransforms',
  true
)
FROM store_items si
WHERE ui.item_id = si.id
  AND ui.data->'modelTransforms' IS NULL
  AND si.data->'modelTransforms' IS NOT NULL;

-- Diagnóstico: quantos itens locais ainda estão sem modelTransforms
SELECT count(*) AS locais_sem_transform
FROM store_items
WHERE is_global = false
  AND data->'modelTransforms' IS NULL;