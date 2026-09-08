-- TRAVA o lado de torcida do espectador no duelo.
-- - Ao entrar: registra o lado escolhido (watchUid) e marca active=true.
-- - Se já é espectador: NÃO troca o lado (mantém a primeira escolha), só atualiza nome/avatar/ativo.
-- - Ao sair: mantém o registro (para travar o lado), apenas marca active=false.
-- A recompensa de 0,25% só vale se o espectador ficou ativo até o final E o lado registrado venceu.
-- RODE ESTE SQL NO SUPABASE (SQL Editor).

create or replace function public.pvp_join_spectator(p_match_id uuid, p_uid uuid, p_name text, p_avatar_config jsonb, p_watch_uid uuid default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m pvp_matches%rowtype;
  found_uid text;
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;

  -- Já é espectador? O lado de torcida fica TRAVADO: mantém o watchUid original.
  select e->>'uid' into found_uid
  from jsonb_array_elements(coalesce(m.spectators, '[]'::jsonb)) e
  where e->>'uid' = p_uid::text
  limit 1;

  if found_uid is not null then
    update pvp_matches
    set spectators = (
      select jsonb_agg(
        case when e->>'uid' = p_uid::text then
          jsonb_build_object(
            'uid', e->>'uid',
            'name', p_name,
            'avatarConfig', coalesce(p_avatar_config, e->'avatarConfig'),
            'watchUid', e->>'watchUid',
            'active', true
          )
        else e end
      )
      from jsonb_array_elements(coalesce(m.spectators, '[]'::jsonb)) e
    )
    where id = p_match_id;
    return;
  end if;

  -- Novo espectador: registra o lado escolhido.
  update pvp_matches
  set spectators = coalesce(spectators, '[]'::jsonb) || jsonb_build_object(
    'uid', p_uid::text,
    'name', p_name,
    'avatarConfig', coalesce(p_avatar_config, '{}'::jsonb),
    'watchUid', coalesce(p_watch_uid, p_uid)::text,
    'active', true
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
begin
  select * into m from pvp_matches where id = p_match_id;
  if not found then return; end if;
  -- Mantém o registro (para travar o lado), apenas marca como inativo.
  update pvp_matches
  set spectators = (
    select jsonb_agg(
      case when e->>'uid' = p_uid::text then jsonb_set(e, '{active}', 'false'::jsonb) else e end
    )
    from jsonb_array_elements(coalesce(m.spectators, '[]'::jsonb)) e
  )
  where id = p_match_id;
end;
$$;