-- ============================================================
-- BACKFILL: aplica buff de validade (3 dias) aos anúncios atuais do Bazar
-- ------------------------------------------------------------
-- Contexto: itens à venda no bazar agora têm validade (licença de venda
-- com buff de 1/3/5/10/15 dias). Anúncios existentes recebem 3 dias de
-- prazo para continuarem disponíveis; ao expirar, o item volta ao
-- inventário do vendedor automaticamente (ou é ocultado se não houver espaço).
-- ============================================================

UPDATE user_items
SET data = jsonb_set(
  jsonb_set(
    data::jsonb,
    '{saleExpiresAt}',
    to_jsonb((extract(epoch from now())::bigint * 1000) + (3 * 86400000))
  ),
  '{saleBuffDays}',
  to_jsonb(3)
)
WHERE data->>'forSale' = 'true'
  AND data->>'saleExpiresAt' IS NULL;

-- Diagnóstico: anúncios ativos com a nova validade (devem aparecer todos
-- com 3 dias contados de agora).
SELECT
  id,
  student_id,
  data->>'itemTitle' AS item,
  data->>'saleBuffDays' AS buff_dias,
  to_timestamp((data->>'saleExpiresAt')::bigint / 1000) AS expira_em
FROM user_items
WHERE data->>'forSale' = 'true'
ORDER BY expira_em;