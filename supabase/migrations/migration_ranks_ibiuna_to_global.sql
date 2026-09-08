-- ============================================================
-- Copia as patentes LOCAIS do tenant "Colégio Adventista de Ibiúna"
-- para o BANCO DE PATENTES (globais, tenant_id = NULL).
-- Objetivo: outras escolas podem importar essas patentes prontas
-- (com imagens, XPs, variações e baús) sem recadastrar tudo.
--
-- 100% dinâmico: lê as colunas reais da tabela custom_ranks e copia
-- todas (exceto id/tenant_id/is_global), aceitando qualquer convenção
-- de nome (camelCase ou snake_case).
-- Idempotente: remove cópias anteriores (global_ibiuna_%) e os
-- placeholders padrão (default_global_%).
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
DO $$
DECLARE
  v_tenant_id uuid;
  v_xp_col text;
  v_cols text := '';
  v_sel  text := '';
  r record;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants
  WHERE name ILIKE '%ibiúna%'
     OR name ILIKE '%ibiuna%'
     OR slug ILIKE '%ibiuna%'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Tenant do Colégio Adventista de Ibiúna não encontrado. Ajuste o filtro na seção 1.';
    RETURN;
  END IF;

  -- Descobre a coluna de XP (qualquer convenção)
  SELECT column_name INTO v_xp_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'custom_ranks'
    AND (column_name ILIKE '%minxp%' OR column_name ILIKE '%min_xp%')
  LIMIT 1;
  IF v_xp_col IS NULL THEN
    RAISE EXCEPTION 'Coluna de XP não encontrada em custom_ranks';
  END IF;

  -- Coleta todas as demais colunas reais
  FOR r IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'custom_ranks'
      AND column_name NOT IN ('id', 'tenant_id', 'is_global')
    ORDER BY ordinal_position
  LOOP
    v_cols := v_cols || ', ' || quote_ident(r.column_name);
    v_sel  := v_sel  || ', ' || quote_ident(r.column_name);
  END LOOP;

  EXECUTE format(
    'INSERT INTO public.custom_ranks (id, tenant_id, is_global%s) '
    || 'SELECT ''global_ibiuna_'' || (row_number() OVER (ORDER BY %s))::text, NULL, true%s '
    || 'FROM public.custom_ranks WHERE tenant_id = %L AND is_global = false ORDER BY %s',
    v_cols, quote_ident(v_xp_col), v_sel, v_tenant_id, quote_ident(v_xp_col)
  );
END $$;

-- 4) Diagnóstico: globais agora disponíveis no Banco de Patentes
SELECT id, "name", tenant_id, is_global
FROM public.custom_ranks
WHERE is_global = true
ORDER BY 1;