-- LIMPA SKINS PRÉ-DEFINIDAS ÓRFÃS (GLB de molde excluído)
-- Remove skins cujo modelo 3D vinculado não existe mais, em DOIS casos:
--  1) baseModelId preenchido apontando para molde inexistente.
--  2) baseModelId NULL mas config.customModelUrl preenchida (skin GLB "solta").
-- ATENÇÃO: exclui definitivamente essas skins da lista. Rode e confirme.
-- RODE NO SUPABASE (SQL Editor).

DELETE FROM preset_skins s
WHERE
  -- Caso 1: baseModelId aponta para um molde que não existe
  (
    s."baseModelId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "3d_models" m WHERE m.id = s."baseModelId")
  )
  OR
  -- Caso 2: skin GLB sem vínculo (baseModelId NULL, mas com customModelUrl)
  (
    s."baseModelId" IS NULL
    AND s.config IS NOT NULL
    AND (CAST(s.config AS jsonb)->>'customModelUrl') IS NOT NULL
    AND (CAST(s.config AS jsonb)->>'customModelUrl') <> ''
  );