-- Script para resetar a forja de todos os itens equipáveis já existentes para +0
-- Este script define a propriedade forgeLevel = 0 dentro da coluna JSON 'data'.
-- Você pode executar isso no SQL Editor do seu painel Supabase.

UPDATE user_items
SET data = jsonb_set(
  CASE WHEN data IS NULL THEN '{}'::jsonb ELSE data::jsonb END,
  '{forgeLevel}',
  '0'::jsonb,
  true
)
WHERE data->>'type' = 'equippable' OR data->>'itemType' = 'equippable';
