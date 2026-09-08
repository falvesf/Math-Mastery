-- Registra o lado (jogador torcido) de cada espectador para calcular a
-- divisão da recompensa de 0,25% da aposta entre os espectadores do lado vencedor.
-- RODE ESTE SQL NO SUPABASE (SQL Editor).

create or replace function public.pvp_join_spectator(p_match_id uuid, p_uid uuid, p_name text, p_avatar_config jsonb, p_watch_uid uuid default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update pvp_matches
  set spectators = coalesce(spectators, '[]'::jsonb) || jsonb_build_object(
    'uid', p_uid::text,
    'name', p_name,
    'avatarConfig', coalesce(p_avatar_config, '{}'::jsonb),
    'watchUid', coalesce(p_watch_uid, p_uid)::text
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
        'avatarConfig', e->'avatarConfig',
        'watchUid', e->>'watchUid'
      );
    end if;
  end loop;
  update pvp_matches set spectators = new_arr where id = p_match_id;
end;
$$;