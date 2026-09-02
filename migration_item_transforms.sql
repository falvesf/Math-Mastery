-- ============================================================
-- Registro GLOBAL de transforms de itens (Debug 3D)
-- Compartilhado entre TODOS os tenants: um item idêntico
-- (mesmo título + parte do corpo + modelo 3D) usa a MESMA
-- configuração de posição, não importa em qual escola foi
-- comprado. Evita itens "voando" ao trocar de tenant.
-- ============================================================

CREATE TABLE IF NOT EXISTS item_transforms (
  item_key TEXT PRIMARY KEY,
  model_transforms JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Backfill: importa os transforms já configurados nas lojas locais
-- (ex.: "Colégio Adventista de Ibiúna") para o registro global.
-- A chave é concatenada no MESMO formato do frontend:
--   itemTitle | avatarPart | gameModelUrl
INSERT INTO item_transforms (item_key, model_transforms, updated_at)
SELECT
  s.item_key,
  jsonb_object_agg(k, v),
  now()
FROM (
  SELECT
    concat_ws('|', (data->>'itemTitle'), (data->>'avatarPart'), (data->>'gameModelUrl')) AS item_key,
    data->'modelTransforms' AS mt
  FROM store_items
  WHERE data ? 'modelTransforms'
    AND jsonb_typeof(data->'modelTransforms') = 'object'
) s,
LATERAL jsonb_each(s.mt) AS e(k, v)
GROUP BY s.item_key
ON CONFLICT (item_key) DO NOTHING;