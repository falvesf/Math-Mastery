-- ============================================================
-- CORREÇÃO: Itens de skin importados perderam unlockedSkinId
-- Os itens locais de "unlock_skin" foram importados com a versão
-- antiga que forçava gameEffect='none' e não copiava unlockedSkinId.
--
-- Este script, para cada item LOCAL (is_global=false) que foi
-- importado de um item GLOBAL (importedFromId), copia do global:
--   * gameEffect      -> 'unlock_skin'
--   * unlockedSkinId  -> URL da skin
--   * buffDurationDays -> duração
--   * avatarPart, itemCategory, baseAttributeType, baseAttributeValue,
--     fixedAttributes, backColor (campos de personalização)
-- ============================================================

UPDATE store_items AS local_item
SET data = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(local_item.data, '{}'::jsonb),
      '{gameEffect}',
      COALESCE(global_item.data->'gameEffect', '"none"'::jsonb)
    ),
    '{unlockedSkinId}',
    COALESCE(global_item.data->'unlockedSkinId', '""'::jsonb)
  ),
  '{buffDurationDays}',
  COALESCE(global_item.data->'buffDurationDays', 'null'::jsonb)
) || jsonb_build_object(
  'avatarPart', global_item.data->'avatarPart',
  'itemCategory', global_item.data->'itemCategory',
  'baseAttributeType', global_item.data->'baseAttributeType',
  'baseAttributeValue', global_item.data->'baseAttributeValue',
  'fixedAttributes', global_item.data->'fixedAttributes',
  'backColor', global_item.data->'backColor'
)
FROM store_items AS global_item
WHERE local_item.is_global = false
  AND local_item.data->>'importedFromId' IS NOT NULL
  AND local_item.data->>'importedFromId' = global_item.id::text;

-- Verificação: itens de skin locais agora devem ter unlockedSkinId
SELECT name,
       data->>'gameEffect' AS game_effect,
       CASE WHEN data->>'unlockedSkinId' IS NOT NULL AND data->>'unlockedSkinId' <> '' THEN 'OK' ELSE 'SEM ICONE' END AS icone
FROM store_items
WHERE is_global = false
  AND data->>'gameEffect' = 'unlock_skin'
ORDER BY name;