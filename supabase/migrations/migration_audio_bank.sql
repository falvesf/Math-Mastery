-- ============================================================
-- MIGRAÇÃO: BANCO DE ÁUDIO + SONS DE BATALHA
-- 1) Tabela global de áudio (acessível pelo menu Missões).
-- 2) Colunas em quests:
--      battle_music_url      -> música ambiente da batalha (banco)
--      battle_music_volume   -> volume da música (0..1)
--      monster_gender        -> gênero do monstro (male/female) p/ voz
--      monster_attack_sound  -> som de ataque do monstro
--      monster_grunt_sound   -> grunido do monstro
--      monster_damage_sound  -> som quando o monstro RECEBE dano
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audio_bank (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT DEFAULT 'effect',
  gender TEXT,
  tenant_id UUID,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- O app já filtra por tenant_id no código; RLS sem políticas bloquearia escrita.
ALTER TABLE public.audio_bank DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS battle_music_url TEXT;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS battle_music_volume REAL DEFAULT 0.5;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS monster_gender TEXT;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS monster_attack_sound TEXT;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS monster_grunt_sound TEXT;
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS monster_damage_sound TEXT;

-- Som da moeda caindo no chão (cadastrado no molde da moeda)
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS coin_sound_url TEXT;

-- Verificação
SELECT column_name FROM information_schema.columns WHERE table_name = 'audio_bank' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns WHERE table_name = 'quests' AND column_name IN ('battle_music_url','battle_music_volume','monster_gender','monster_attack_sound','monster_grunt_sound','monster_damage_sound');
SELECT column_name FROM information_schema.columns WHERE table_name = '3d_models' AND column_name = 'coin_sound_url';