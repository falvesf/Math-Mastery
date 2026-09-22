-- Cenários (mapas de exploração) — config que o MapExplorerPoC consome.
-- A config define: dimensões, tipos de parede (HP/defesa/quebrável/armadilha),
-- portas (HP/defesa/modo de abertura), tabela de loot e chance de armadilha.

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  name text not null default 'Cenário Padrão',
  theme text not null default 'plains',
  is_active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scenarios disable row level security;

-- Cenário padrão (global) — usado como fallback quando a missão não define um cenário.
insert into public.scenarios (tenant_id, name, theme, is_active, config)
select null, 'Cenário Padrão (Planície)', 'plains', true, $cfg$
{
  "cols": 48,
  "rows": 18,
  "revealRadius": 5,
  "wallTrapChance": 0.12,
  "defaultWallType": "stone",
  "wallTypes": [
    { "id": "stone",   "name": "Pedra",     "hp": 1000, "def": 250, "breakable": true,  "chance": 0.72, "color": "#6b7280", "trapChance": 0.12 },
    { "id": "bedrock", "name": "Rocha-mãe", "hp": 999999, "def": 999999, "breakable": false, "chance": 0.28, "color": "#374151" }
  ],
  "doorTypes": [
    { "id": "wood",  "name": "Porta de Madeira", "hp": 600,  "def": 120, "openMode": "challenge", "challengeChance": 0.7, "color": "#8b5a2b" },
    { "id": "steel", "name": "Porta de Aço",     "hp": 3000, "def": 900, "openMode": "challenge", "challengeChance": 1.0, "color": "#9aa4b2" }
  ],
  "lootTable": [
    { "kind": "coins",   "weight": 40, "min": 1, "max": 10 },
    { "kind": "heart",   "weight": 15 },
    { "kind": "potion",  "weight": 10 },
    { "kind": "nothing", "weight": 35 }
  ]
}
$cfg$::jsonb
where not exists (select 1 from public.scenarios where name = 'Cenário Padrão (Planície)');
