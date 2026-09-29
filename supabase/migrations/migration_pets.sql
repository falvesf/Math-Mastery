-- ============================================================
-- MIGRAÇÃO: PETS / RANCHO
-- Guarda os animais domesticados pelo aluno, o estado do rancho
-- (água do cocho, etc.) e os equipamentos do rancho (cochos/palha).
-- ============================================================

CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  tenant_id UUID,
  animal_model_id TEXT,               -- 3d_models.id (category 'animal')
  species_name TEXT,                  -- nome da espécie (p/ comparar com abates)
  name TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  relationship INTEGER DEFAULT 1,     -- 1..5
  -- Barras de necessidade (0..100)
  hunger NUMERIC DEFAULT 12.5,
  thirst NUMERIC DEFAULT 12.5,
  interaction NUMERIC DEFAULT 12.5,
  training NUMERIC DEFAULT 0,
  -- Cada barra guarda seu próprio "atualizado em" (decai em tempo real, independente).
  hunger_updated_at TIMESTAMPTZ DEFAULT now(),
  thirst_updated_at TIMESTAMPTZ DEFAULT now(),
  interaction_updated_at TIMESTAMPTZ DEFAULT now(),
  -- Estados: 'ranch' | 'equipped' | 'ran_away' | 'dead'
  state TEXT DEFAULT 'ranch',
  equipped BOOLEAN DEFAULT false,
  -- Atributos atuais do pet (hp/attack/defense/evasion/crit/speed/attackSpeed)
  stats JSONB DEFAULT '{}'::jsonb,
  -- Histórico: [{ at, type: 'achievement' | 'record', text }]
  history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pets_student_idx ON pets (student_id);

-- Estado do rancho por aluno (nível de água do bebedouro, etc.)
CREATE TABLE IF NOT EXISTS ranches (
  student_id UUID PRIMARY KEY,
  tenant_id UUID,
  water_level NUMERIC DEFAULT 100,    -- 0..100
  water_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Equipamentos do rancho (cocho de comida, bebedouro, palha) com nível.
CREATE TABLE IF NOT EXISTS ranch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  tenant_id UUID,
  kind TEXT NOT NULL,                 -- 'food_trough' | 'water_trough' | 'hay'
  level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ranch_items_student_idx ON ranch_items (student_id);

-- Verificação
SELECT 'pets' AS tabela, count(*) FROM pets
UNION ALL SELECT 'ranches', count(*) FROM ranches
UNION ALL SELECT 'ranch_items', count(*) FROM ranch_items;
