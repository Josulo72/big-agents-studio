-- =============================================================
-- TORNEO DE PADEL - Esquema completo (doble eliminacion)
-- Todo el acceso se hace via funciones RPC (security definer).
-- Las tablas tienen RLS activado sin politicas => sin acceso directo.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- TABLAS ----------

create table if not exists public.padel_tournament (
  id            int primary key default 1 check (id = 1),
  name          text not null default 'Torneo de Padel',
  club          text not null default '',
  status        text not null default 'registration'
                check (status in ('registration','in_progress','finished')),
  registration_open boolean not null default true,
  bracket_visible   boolean not null default false,
  target_pairs  int not null default 16 check (target_pairs between 2 and 200),
  double_final  boolean not null default false,
  schedule_config jsonb not null default '{"days":[],"start":"09:00","end":"21:00","match_minutes":60,"courts":["Pista 1"]}'::jsonb,
  champion_id   int,
  admin_hash    text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists public.padel_pairs (
  id          serial primary key,
  player1     text not null,
  player2     text not null,
  phone       text not null default '',
  secret_code text not null unique,
  seed        int,
  created_at  timestamptz not null default now()
);

create table if not exists public.padel_matches (
  id             serial primary key,
  code           text not null unique,          -- W1-1, L2-3, GF1, GF2
  bracket        text not null check (bracket in ('W','L','GF')),
  round          int  not null,
  position       int  not null,
  stage          int  not null default 1,       -- orden logico para programar
  pair1_id       int references public.padel_pairs(id) on delete set null,
  pair2_id       int references public.padel_pairs(id) on delete set null,
  slot1_void     boolean not null default false,
  slot2_void     boolean not null default false,
  winner_id      int references public.padel_pairs(id) on delete set null,
  score          text not null default '',
  status         text not null default 'pending'
                 check (status in ('pending','ready','played','bye','void')),
  scheduled_at   timestamptz,
  court          text not null default '',
  win_next_code  text,
  win_next_slot  int,
  lose_next_code text,
  lose_next_slot int,
  reported_by    int,
  unique (bracket, round, position)
);

alter table public.padel_tournament enable row level security;
alter table public.padel_pairs      enable row level security;
alter table public.padel_matches    enable row level security;

-- Fila inicial del torneo (password inicial: padel2026 - CAMBIALA desde el panel)
insert into public.padel_tournament (id, admin_hash)
values (1, crypt('padel2026', gen_salt('bf')))
on conflict (id) do nothing;

-- ---------- HELPERS INTERNOS ----------

create or replace function public.padel_require_admin(p_pass text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare t record;
begin
  select * into t from padel_tournament where id = 1;
  if t is null or t.admin_hash <> crypt(p_pass, t.admin_hash) then
    raise exception 'Contrasena de administrador incorrecta';
  end if;
end $$;

-- Coloca una pareja en un hueco de un partido y resuelve byes en cascada.
create or replace function public.padel_place_pair(p_code text, p_slot int, p_pair int)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if p_code is null then return; end if;
  select * into m from padel_matches where code = p_code;
  if m is null then return; end if;

  if p_slot = 1 then
    update padel_matches set pair1_id = p_pair where id = m.id;
  else
    update padel_matches set pair2_id = p_pair where id = m.id;
  end if;
  select * into m from padel_matches where id = m.id;

  if m.pair1_id is not null and m.pair2_id is not null then
    update padel_matches set status = 'ready' where id = m.id and status = 'pending';
  elsif (p_slot = 1 and m.slot2_void) or (p_slot = 2 and m.slot1_void) then
    -- el otro hueco nunca se llenara: gana por bye
    perform padel_apply_result(m.id, p_pair, '', null, true);
  end if;
end $$;

-- Marca un hueco como "nunca se llenara" y propaga.
create or replace function public.padel_mark_void(p_code text, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if p_code is null then return; end if;
  select * into m from padel_matches where code = p_code;
  if m is null then return; end if;

  if p_slot = 1 then
    update padel_matches set slot1_void = true where id = m.id;
  else
    update padel_matches set slot2_void = true where id = m.id;
  end if;
  select * into m from padel_matches where id = m.id;

  if m.status in ('played','bye','void') then return; end if;

  if m.slot1_void and m.slot2_void then
    update padel_matches set status = 'void' where id = m.id;
    perform padel_mark_void(m.win_next_code, m.win_next_slot);
    perform padel_mark_void(m.lose_next_code, m.lose_next_slot);
  elsif m.slot1_void and m.pair2_id is not null then
    perform padel_apply_result(m.id, m.pair2_id, '', null, true);
  elsif m.slot2_void and m.pair1_id is not null then
    perform padel_apply_result(m.id, m.pair1_id, '', null, true);
  end if;
end $$;

-- Aplica un resultado y avanza ganador/perdedor por el cuadro.
create or replace function public.padel_apply_result(
  p_match int, p_winner int, p_score text, p_reported int, p_is_bye boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  v_loser int;
  gf2 record;
begin
  select * into m from padel_matches where id = p_match;
  if m is null then raise exception 'Partido no encontrado'; end if;
  if p_winner is distinct from m.pair1_id and p_winner is distinct from m.pair2_id then
    raise exception 'El ganador no juega ese partido';
  end if;

  v_loser := case when p_winner = m.pair1_id then m.pair2_id else m.pair1_id end;

  update padel_matches
     set winner_id = p_winner,
         score = coalesce(p_score, ''),
         status = case when p_is_bye then 'bye' else 'played' end,
         reported_by = p_reported
   where id = m.id;

  if m.bracket = 'GF' then
    if m.round = 1 then
      select * into gf2 from padel_matches where code = 'GF2';
      if gf2 is not null and p_winner = m.pair2_id then
        -- el que venia de perdedores gana la final: partido de desempate
        update padel_matches
           set pair1_id = m.pair1_id, pair2_id = m.pair2_id, status = 'ready'
         where id = gf2.id;
        return;
      end if;
      if gf2 is not null then
        update padel_matches set status = 'void' where id = gf2.id;
      end if;
    end if;
    update padel_tournament
       set champion_id = p_winner, status = 'finished', updated_at = now()
     where id = 1;
    return;
  end if;

  perform padel_place_pair(m.win_next_code, m.win_next_slot, p_winner);
  if m.lose_next_code is not null then
    if v_loser is null then
      perform padel_mark_void(m.lose_next_code, m.lose_next_slot);
    else
      perform padel_place_pair(m.lose_next_code, m.lose_next_slot, v_loser);
    end if;
  end if;
end $$;

-- Los helpers internos NO se pueden llamar desde la API publica
revoke execute on function public.padel_require_admin(text) from public, anon, authenticated;
revoke execute on function public.padel_place_pair(text,int,int) from public, anon, authenticated;
revoke execute on function public.padel_mark_void(text,int) from public, anon, authenticated;
revoke execute on function public.padel_apply_result(int,int,text,int,boolean) from public, anon, authenticated;

-- ---------- RPC PUBLICAS (participantes) ----------

-- Estado publico del torneo
create or replace function public.padel_get_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record;
  res jsonb;
begin
  select * into t from padel_tournament where id = 1;
  res := jsonb_build_object(
    'name', t.name,
    'club', t.club,
    'status', t.status,
    'registration_open', t.registration_open,
    'bracket_visible', t.bracket_visible,
    'target_pairs', t.target_pairs,
    'pairs_count', (select count(*) from padel_pairs),
    'days', t.schedule_config->'days',
    'champion', (select jsonb_build_object('id', p.id, 'player1', p.player1, 'player2', p.player2)
                   from padel_pairs p where p.id = t.champion_id)
  );
  if t.bracket_visible then
    res := res || jsonb_build_object(
      'pairs', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'player1', p.player1, 'player2', p.player2, 'seed', p.seed)
                  order by coalesce(p.seed, 9999), p.id)
                 from padel_pairs p), '[]'::jsonb),
      'matches', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', m.id, 'code', m.code, 'bracket', m.bracket, 'round', m.round,
                  'position', m.position, 'stage', m.stage,
                  'pair1_id', m.pair1_id, 'pair2_id', m.pair2_id,
                  'slot1_void', m.slot1_void, 'slot2_void', m.slot2_void,
                  'winner_id', m.winner_id, 'score', m.score, 'status', m.status,
                  'scheduled_at', m.scheduled_at, 'court', m.court,
                  'win_next_code', m.win_next_code, 'lose_next_code', m.lose_next_code)
                  order by m.bracket, m.round, m.position)
                 from padel_matches m), '[]'::jsonb)
    );
  end if;
  return res;
end $$;

-- Inscripcion de una pareja
create or replace function public.padel_signup(p_player1 text, p_player2 text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  t record;
  v_code text;
  v_id int;
  n int;
begin
  perform pg_advisory_xact_lock(772201);
  select * into t from padel_tournament where id = 1;
  if t.status <> 'registration' or not t.registration_open then
    raise exception 'La inscripcion esta cerrada';
  end if;
  if btrim(coalesce(p_player1,'')) = '' or btrim(coalesce(p_player2,'')) = '' then
    raise exception 'Faltan los nombres de los dos jugadores';
  end if;
  if length(p_player1) > 60 or length(p_player2) > 60 or length(coalesce(p_phone,'')) > 30 then
    raise exception 'Datos demasiado largos';
  end if;
  select count(*) into n from padel_pairs;
  if n >= t.target_pairs then
    raise exception 'El torneo esta completo (% parejas)', t.target_pairs;
  end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from padel_pairs where secret_code = v_code);
  end loop;
  insert into padel_pairs (player1, player2, phone, secret_code)
  values (btrim(p_player1), btrim(p_player2), btrim(coalesce(p_phone,'')), v_code)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'pair_id', v_id, 'code', v_code, 'position', n + 1);
end $$;

-- Estado de "mi pareja" via codigo secreto
create or replace function public.padel_my_pair(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record;
  p record;
  res jsonb;
begin
  select * into t from padel_tournament where id = 1;
  select * into p from padel_pairs where secret_code = upper(btrim(p_code));
  if p is null then raise exception 'Codigo no valido'; end if;
  res := jsonb_build_object(
    'pair', jsonb_build_object('id', p.id, 'player1', p.player1, 'player2', p.player2, 'seed', p.seed),
    'bracket_visible', t.bracket_visible,
    'status', t.status
  );
  if t.bracket_visible then
    res := res || jsonb_build_object('matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'code', m.code, 'bracket', m.bracket, 'round', m.round,
        'status', m.status, 'score', m.score, 'winner_id', m.winner_id,
        'scheduled_at', m.scheduled_at, 'court', m.court,
        'pair1', (select jsonb_build_object('id', a.id, 'player1', a.player1, 'player2', a.player2)
                    from padel_pairs a where a.id = m.pair1_id),
        'pair2', (select jsonb_build_object('id', b.id, 'player1', b.player1, 'player2', b.player2)
                    from padel_pairs b where b.id = m.pair2_id))
        order by m.stage, m.round, m.position)
      from padel_matches m
      where (m.pair1_id = p.id or m.pair2_id = p.id) and m.status <> 'void'), '[]'::jsonb));
  end if;
  return res;
end $$;

-- Una pareja envia el resultado de su partido
create or replace function public.padel_report_result(
  p_code text, p_match int, p_winner int, p_score text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record;
  p record;
  m record;
begin
  select * into t from padel_tournament where id = 1;
  if t.status <> 'in_progress' then raise exception 'El torneo no esta en juego'; end if;
  select * into p from padel_pairs where secret_code = upper(btrim(p_code));
  if p is null then raise exception 'Codigo no valido'; end if;
  select * into m from padel_matches where id = p_match;
  if m is null then raise exception 'Partido no encontrado'; end if;
  if m.pair1_id <> p.id and m.pair2_id <> p.id then
    raise exception 'Tu pareja no juega ese partido';
  end if;
  if m.status <> 'ready' then
    raise exception 'Este partido no admite resultado (estado: %)', m.status;
  end if;
  if length(coalesce(p_score,'')) > 40 then raise exception 'Resultado demasiado largo'; end if;
  perform padel_apply_result(m.id, p_winner, p_score, p.id, false);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- RPC DE ADMINISTRADOR ----------

create or replace function public.padel_admin_login(p_pass text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.padel_admin_state(p_pass text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record;
begin
  perform padel_require_admin(p_pass);
  select * into t from padel_tournament where id = 1;
  return jsonb_build_object(
    'tournament', jsonb_build_object(
      'name', t.name, 'club', t.club, 'status', t.status,
      'registration_open', t.registration_open, 'bracket_visible', t.bracket_visible,
      'target_pairs', t.target_pairs, 'double_final', t.double_final,
      'schedule_config', t.schedule_config, 'champion_id', t.champion_id),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'player1', p.player1, 'player2', p.player2, 'phone', p.phone,
        'secret_code', p.secret_code, 'seed', p.seed, 'created_at', p.created_at)
        order by coalesce(p.seed, 9999), p.id) from padel_pairs p), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m) - 'reported_by'
        order by m.stage, m.bracket, m.round, m.position) from padel_matches m), '[]'::jsonb)
  );
end $$;

create or replace function public.padel_admin_update_settings(p_pass text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  update padel_tournament set
    name              = coalesce(p->>'name', name),
    club              = coalesce(p->>'club', club),
    registration_open = coalesce((p->>'registration_open')::boolean, registration_open),
    bracket_visible   = coalesce((p->>'bracket_visible')::boolean, bracket_visible),
    target_pairs      = coalesce((p->>'target_pairs')::int, target_pairs),
    double_final      = coalesce((p->>'double_final')::boolean, double_final),
    schedule_config   = coalesce(p->'schedule_config', schedule_config),
    updated_at        = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.padel_admin_change_password(p_pass text, p_new text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform padel_require_admin(p_pass);
  if length(coalesce(p_new,'')) < 6 then
    raise exception 'La nueva contrasena debe tener al menos 6 caracteres';
  end if;
  update padel_tournament set admin_hash = crypt(p_new, gen_salt('bf')), updated_at = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.padel_admin_add_pair(p_pass text, p_player1 text, p_player2 text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; v_id int; n int;
begin
  perform padel_require_admin(p_pass);
  select count(*) into n from padel_pairs;
  if n >= 200 then raise exception 'Maximo 200 parejas'; end if;
  if btrim(coalesce(p_player1,'')) = '' or btrim(coalesce(p_player2,'')) = '' then
    raise exception 'Faltan nombres';
  end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from padel_pairs where secret_code = v_code);
  end loop;
  insert into padel_pairs (player1, player2, phone, secret_code)
  values (btrim(p_player1), btrim(p_player2), btrim(coalesce(p_phone,'')), v_code)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'pair_id', v_id, 'code', v_code);
end $$;

create or replace function public.padel_admin_update_pair(p_pass text, p_id int, p_player1 text, p_player2 text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  update padel_pairs set
    player1 = coalesce(nullif(btrim(p_player1),''), player1),
    player2 = coalesce(nullif(btrim(p_player2),''), player2),
    phone   = coalesce(btrim(p_phone), phone)
  where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.padel_admin_delete_pair(p_pass text, p_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  if exists (select 1 from padel_matches) then
    raise exception 'No se puede borrar una pareja con el cuadro ya sorteado. Reinicia el cuadro primero.';
  end if;
  delete from padel_pairs where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Crea el cuadro completo (lo genera el panel de admin y lo manda como JSON)
create or replace function public.padel_admin_create_bracket(p_pass text, p_seeds jsonb, p_matches jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb;
begin
  perform padel_require_admin(p_pass);
  if exists (select 1 from padel_matches) then
    raise exception 'Ya hay un cuadro creado. Reinicialo antes de sortear de nuevo.';
  end if;
  -- seeds: {"pair_id": seed, ...}
  update padel_pairs p set seed = (p_seeds->>(p.id::text))::int
  where p_seeds ? p.id::text;

  for item in select * from jsonb_array_elements(p_matches) loop
    insert into padel_matches
      (code, bracket, round, position, stage, pair1_id, pair2_id,
       slot1_void, slot2_void, winner_id, score, status,
       win_next_code, win_next_slot, lose_next_code, lose_next_slot)
    values (
      item->>'code', item->>'bracket', (item->>'round')::int, (item->>'position')::int,
      coalesce((item->>'stage')::int, 1),
      nullif(item->>'pair1_id','')::int, nullif(item->>'pair2_id','')::int,
      coalesce((item->>'slot1_void')::boolean, false),
      coalesce((item->>'slot2_void')::boolean, false),
      nullif(item->>'winner_id','')::int, coalesce(item->>'score',''),
      coalesce(item->>'status','pending'),
      item->>'win_next_code', nullif(item->>'win_next_slot','')::int,
      item->>'lose_next_code', nullif(item->>'lose_next_slot','')::int);
  end loop;

  update padel_tournament
     set status = 'in_progress', registration_open = false, champion_id = null, updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true, 'matches', (select count(*) from padel_matches));
end $$;

create or replace function public.padel_admin_reset_bracket(p_pass text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  -- Supabase bloquea DELETE/UPDATE sin WHERE (safeupdate)
  delete from padel_matches where true;
  update padel_pairs set seed = null where true;
  update padel_tournament
     set status = 'registration', champion_id = null, bracket_visible = false, updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- El admin pone o corrige un resultado
create or replace function public.padel_admin_set_result(p_pass text, p_match int, p_winner int, p_score text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; nxt record;
begin
  perform padel_require_admin(p_pass);
  select * into m from padel_matches where id = p_match;
  if m is null then raise exception 'Partido no encontrado'; end if;

  if m.status = 'played' then
    -- correccion: solo si los partidos siguientes aun no se han jugado
    for nxt in select * from padel_matches where code in (m.win_next_code, m.lose_next_code) loop
      if nxt.status in ('played','bye') then
        raise exception 'No se puede corregir: el partido % ya tiene resultado. Corrige primero los partidos posteriores o reinicia el cuadro.', nxt.code;
      end if;
    end loop;
    -- quitar las parejas que se habian colocado en los partidos siguientes
    update padel_matches set pair1_id = null, status = 'pending'
      where code = m.win_next_code and m.win_next_slot = 1 and pair1_id = m.winner_id;
    update padel_matches set pair2_id = null, status = 'pending'
      where code = m.win_next_code and m.win_next_slot = 2 and pair2_id = m.winner_id;
    update padel_matches set pair1_id = null, status = 'pending'
      where code = m.lose_next_code and m.lose_next_slot = 1
        and pair1_id = case when m.winner_id = m.pair1_id then m.pair2_id else m.pair1_id end;
    update padel_matches set pair2_id = null, status = 'pending'
      where code = m.lose_next_code and m.lose_next_slot = 2
        and pair2_id = case when m.winner_id = m.pair1_id then m.pair2_id else m.pair1_id end;
    update padel_matches set status = 'ready', winner_id = null, score = ''
      where id = m.id;
    if m.bracket = 'GF' then
      update padel_tournament set champion_id = null, status = 'in_progress', updated_at = now() where id = 1;
    end if;
    select * into m from padel_matches where id = p_match;
  end if;

  if m.status = 'pending' and not (m.pair1_id is not null and m.pair2_id is not null) then
    raise exception 'Este partido aun no tiene las dos parejas';
  end if;
  perform padel_apply_result(p_match, p_winner, p_score, null, false);
  return jsonb_build_object('ok', true);
end $$;

-- Programar partidos (dia/hora/pista) en bloque: [{id, scheduled_at, court}]
create or replace function public.padel_admin_schedule(p_pass text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb; n int := 0;
begin
  perform padel_require_admin(p_pass);
  for item in select * from jsonb_array_elements(p_items) loop
    update padel_matches
       set scheduled_at = nullif(item->>'scheduled_at','')::timestamptz,
           court = coalesce(item->>'court','')
     where id = (item->>'id')::int;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'updated', n);
end $$;
