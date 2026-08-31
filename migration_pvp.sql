-- Sistema PvP (Duelo entre jogadores)
-- Rode manualmente no Supabase SQL Editor.

create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid references users(id) on delete cascade,
  opponent_id uuid references users(id) on delete cascade,
  challenger_name text,
  opponent_name text,
  -- challenged | accepted | playing | finished | cancelled
  status text not null default 'challenged',
  -- arena = dados da arena escolhida (battleBgUrl etc. da quest)
  arena jsonb,
  question_count int default 5,
  -- { challenger: {type:'none'|'coins'|'item', coins?, item?}, opponent: {...} }
  bet jsonb default '{}'::jsonb,
  -- Array com o snapshot das perguntas sorteadas do question_bank
  questions jsonb default '[]'::jsonb,
  -- player1 = desafiante, player2 = desafiado
  player1 jsonb,
  player2 jsonb,
  current_question_index int default 0,
  -- timestamp (epoch ms) de quando a pergunta atual começou (para o timer)
  question_started_at bigint,
  winner_id uuid,
  cancelled_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.pvp_matches enable row level security;

-- LEITURA para TODOS: necessário para o modo espectador (outros jogadores veem o duelo)
-- e para o chat saber quem está em duelo.
drop policy if exists "pvp_read_all" on public.pvp_matches;
create policy "pvp_read_all" on public.pvp_matches
  for select using (true);

-- ESCRITA apenas para os participantes (desafiante/desafiado)
drop policy if exists "pvp_participants_write" on public.pvp_matches;
create policy "pvp_participants_write" on public.pvp_matches
  for insert with check (auth.uid() = challenger_id or auth.uid() = opponent_id);

drop policy if exists "pvp_participants_update" on public.pvp_matches;
create policy "pvp_participants_update" on public.pvp_matches
  for update using (auth.uid() = challenger_id or auth.uid() = opponent_id)
  with check (auth.uid() = challenger_id or auth.uid() = opponent_id);

drop policy if exists "pvp_participants_delete" on public.pvp_matches;
create policy "pvp_participants_delete" on public.pvp_matches
  for delete using (auth.uid() = challenger_id or auth.uid() = opponent_id);

drop policy if exists "pvp_participants_all" on public.pvp_matches;

-- Realtime: os dois jogadores precisam receber updates da partida.
-- (idempotente — não falha se a tabela já for membro da publicação)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pvp_matches'
  ) then
    alter publication supabase_realtime add table public.pvp_matches;
  end if;
end $$;

-- Índice para encontrar desafios pendentes do desafiado e partidas em andamento
create index if not exists idx_pvp_opponent_status on public.pvp_matches (opponent_id, status);
create index if not exists idx_pvp_challenger_status on public.pvp_matches (challenger_id, status);

-- Colunas para animar o ataque do vencedor da última questão
alter table public.pvp_matches add column if not exists last_winner_id uuid;
alter table public.pvp_matches add column if not exists last_winner_at bigint;

-- Last-seen separados (não reescrevem o player1/player2 — evita sobrescrever respostas)
alter table public.pvp_matches add column if not exists challenger_last_seen bigint;
alter table public.pvp_matches add column if not exists opponent_last_seen bigint;

-- Fatalidade sorteada (mesmo valor para os dois clientes — evita fatalidades diferentes por tela)
alter table public.pvp_matches add column if not exists fatal_death text;

-- ============================================================
-- Espectadores (modo assistir duelo)
-- ============================================================
alter table public.pvp_matches add column if not exists spectators jsonb default '[]'::jsonb;

-- Emojis de torcida dos espectadores (aparecem na tela do jogador assistido)
alter table public.pvp_matches add column if not exists match_emojis jsonb default '[]'::jsonb;

-- Espectador envia emoji (security definer — espectador não é participante, mas pode gravar)
create or replace function public.pvp_send_emoji(p_match_id uuid, p_uid uuid, p_name text, p_emoji text, p_target_uid uuid, p_at bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m pvp_matches%rowtype;
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;
  update pvp_matches
  set match_emojis = coalesce(match_emojis, '[]'::jsonb) || jsonb_build_object(
    'uid', p_uid::text,
    'name', p_name,
    'emoji', p_emoji,
    'targetUid', p_target_uid::text,
    'at', p_at
  )
  where id = p_match_id;
end;
$$;

create or replace function public.pvp_join_spectator(p_match_id uuid, p_uid uuid, p_name text, p_avatar_config jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m pvp_matches%rowtype;
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;
  update pvp_matches
  set spectators = coalesce(spectators, '[]'::jsonb) || jsonb_build_object(
    'uid', p_uid::text,
    'name', p_name,
    'avatarConfig', coalesce(p_avatar_config, '{}'::jsonb)
  )
  where id = p_match_id;
end;
$$;

create or replace function public.pvp_leave_spectator(p_match_id uuid, p_uid uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m pvp_matches%rowtype;
  arr jsonb;
  new_arr jsonb;
  e jsonb;
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;
  arr := coalesce(m.spectators, '[]'::jsonb);
  new_arr := '[]'::jsonb;
  for e in select * from jsonb_array_elements(arr) loop
    if e->>'uid' <> p_uid::text then
      new_arr := new_arr || jsonb_build_object(
        'uid', e->>'uid',
        'name', e->>'name',
        'avatarConfig', e->'avatarConfig'
      );
    end if;
  end loop;
  update pvp_matches set spectators = new_arr where id = p_match_id;
end;
$$;

-- ============================================================
-- Escrow e pagamento das apostas (security definer -> bypass RLS)
-- ============================================================

-- Deduz moedas / remove itens dos dois jogadores quando o duelo começa.
create or replace function public.pvp_escrow_bets(p_match_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m pvp_matches%rowtype;
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;

  if (m.bet->'challenger'->>'type') = 'coins' then
    update users set coins = greatest(0, coins - ((m.bet->'challenger'->>'coins')::int))
    where id = m.challenger_id;
  end if;
  if (m.bet->'opponent'->>'type') = 'coins' then
    update users set coins = greatest(0, coins - ((m.bet->'opponent'->>'coins')::int))
    where id = m.opponent_id;
  end if;

  if (m.bet->'challenger'->>'type') = 'item' then
    delete from user_items where id = (m.bet->'challenger'->'item'->>'userItemId')::uuid;
  end if;
  if (m.bet->'opponent'->>'type') = 'item' then
    delete from user_items where id = (m.bet->'opponent'->'item'->>'userItemId')::uuid;
  end if;
end;
$$;

-- Paga as apostas ao vencedor (p_winner_id null = empate, devolve a cada um).
create or replace function public.pvp_pay_bets(p_match_id uuid, p_winner_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m pvp_matches%rowtype;
  amt int := 0;
  side text;
  item jsonb;
  target uuid;
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;

  -- moedas
  if (m.bet->'challenger'->>'type') = 'coins' then amt := amt + ((m.bet->'challenger'->>'coins')::int); end if;
  if (m.bet->'opponent'->>'type') = 'coins' then amt := amt + ((m.bet->'opponent'->>'coins')::int); end if;

  if amt > 0 then
    if p_winner_id is not null then
      update users set coins = coins + amt where id = p_winner_id;
    else
      if (m.bet->'challenger'->>'type') = 'coins' then
        update users set coins = coins + ((m.bet->'challenger'->>'coins')::int) where id = m.challenger_id;
      end if;
      if (m.bet->'opponent'->>'type') = 'coins' then
        update users set coins = coins + ((m.bet->'opponent'->>'coins')::int) where id = m.opponent_id;
      end if;
    end if;
  end if;

  -- itens
  foreach side in array array['challenger'::text, 'opponent'::text] loop
    item := m.bet->side;
    if (item->>'type') = 'item' then
      target := case when p_winner_id is not null then p_winner_id
                     else (case when side = 'challenger' then m.challenger_id else m.opponent_id end) end;
      insert into user_items (student_id, item_id, count, data, tenant_id)
      values (
        target,
        (item->'item'->>'itemId')::uuid,
        1,
        (item->'item'->'data')::jsonb
          || jsonb_build_object('studentId', target::text, 'giftedBy', 'pvp-wager', 'forSale', false, 'price', null, 'saleExpiresAt', null),
        nullif(item->'item'->'data'->>'tenant_id', '')::uuid
      );
    end if;
  end loop;
end;
$$;