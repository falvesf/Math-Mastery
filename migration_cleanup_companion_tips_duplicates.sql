-- ============================================================
-- LIMPEZA: Duplicatas de companion_tips em system_collections
-- O saveCompanionTips antigo inseria uma nova linha a cada salvar.
-- Manter apenas a mais recente (a que contém a dica [name] do admin).
-- ============================================================

-- 1) Backup antes (por segurança)
CREATE TABLE IF NOT EXISTS backup_companion_tips AS
SELECT * FROM system_collections
WHERE collection_name = 'settings' AND doc_id = 'companion_tips';

-- 2) Remover duplicatas, mantendo apenas 1 linha (a mais recente por id)
DELETE FROM system_collections a
USING system_collections b
WHERE a.collection_name = 'settings'
  AND a.doc_id = 'companion_tips'
  AND b.collection_name = 'settings'
  AND b.doc_id = 'companion_tips'
  AND a.id < b.id;

-- 3) Verificação final
SELECT id, created_at, data->>'tips' AS total_dicas
FROM system_collections
WHERE collection_name = 'settings' AND doc_id = 'companion_tips';