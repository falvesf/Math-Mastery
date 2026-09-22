-- Migration: Encontros com monstros no Mapa Explorável
-- Registra a 1ª (e demais) derrotas de monstros nos mapas, para alimentar o
-- Bestiário e as conquistas do jogador (mesma lógica usada nas missões).

CREATE TABLE IF NOT EXISTS monster_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  monster_id TEXT,
  monster_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'failed'
  source TEXT NOT NULL DEFAULT 'map',       -- 'map' | 'quest'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monster_encounters_student ON monster_encounters(student_id);
CREATE INDEX IF NOT EXISTS idx_monster_encounters_monster ON monster_encounters(monster_name);

-- RLS desabilitado (padrão do projeto)
ALTER TABLE monster_encounters DISABLE ROW LEVEL SECURITY;