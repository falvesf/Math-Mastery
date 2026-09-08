-- DIAGNÓSTICO: lista todas as skins pré-definidas (para achar os resquícios que
-- causam "Erro ao salvar" quando você tenta salvar com o mesmo nome).
SELECT id, name, url, type, "baseModelId", "tenant_id", is_global,
       CAST(config AS jsonb)->>'customModelUrl' AS config_model
FROM preset_skins
ORDER BY name NULLS FIRST;