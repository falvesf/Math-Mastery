-- ============================================================
-- Copia as patentes LOCAIS do tenant "Colégio Adventista de Ibiúna"
-- para o BANCO DE PATENTES (globais, tenant_id = NULL).
-- Objetivo: outras escolas podem importar essas patentes prontas
-- (com imagens, XPs, variações e baús) sem recadastrar tudo.
--
-- Idempotente: remove cópias anteriores (global_ibiuna_%) e os
-- placeholders padrão (default_global_%) antes de recriar.
-- ============================================================

-- 1) CONFERIR o tenant (deve retornar a linha do Colégio Adventista de Ibiúna)
SELECT id, name, slug
FROM public.tenants
WHERE name ILIKE '%ibiúna%'
   OR name ILIKE '%ibiuna%'
   OR slug ILIKE '%ibiuna%';

-- 2) Remover cópias anteriores deste tenant no banco global + placeholders padrão
DELETE FROM public.custom_ranks
WHERE is_global = true
  AND (id LIKE 'global_ibiuna_%' OR id LIKE 'default_global_%');

-- 3) Copiar as patentes LOCAIS do tenant para o banco global (tenant_id = NULL)
INSERT INTO public.custom_ranks (
  id, "name", "minXp", "color", "imageUrl", "audioUrl", "variants",
  "rankUpChestItems", "rankUpChestModelId", hide_from_history, tenant_id, is_global
)
SELECT
  'global_ibiuna_' || (row_number() OVER (ORDER BY "minXp"))::text,
  "name", "minXp", "color", "imageUrl", "audioUrl", "variants",
  "rankUpChestItems", "rankUpChestModelId", hide_from_history,
  NULL, true
FROM public.custom_ranks
WHERE tenant_id = (
  SELECT id FROM public.tenants
  WHERE name ILIKE '%ibiúna%'
     OR name ILIKE '%ibiuna%'
     OR slug ILIKE '%ibiuna%'
  LIMIT 1
)
  AND is_global = false
ORDER BY "minXp";

-- 4) Diagnóstico: globais agora disponíveis no Banco de Patentes
SELECT id, "name", "minXp", "color", is_global, tenant_id
FROM public.custom_ranks
WHERE is_global = true
ORDER BY "minXp";