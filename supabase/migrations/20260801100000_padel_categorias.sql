-- =============================================================
-- CATEGORIAS (niveles): cada categoria tiene su propio cuadro
-- de doble eliminacion con su campeon.
-- =============================================================

alter table public.padel_tournament
  add column if not exists categories jsonb not null default '["General"]'::jsonb,
  add column if not exists champions  jsonb not null default '{}'::jsonb;

alter table public.padel_pairs
  add column if not exists category text not null default 'General';

alter table public.padel_matches
  add column if not exists category text not null default 'General';

-- ---------- helpers ----------

create or replace function public.padel_apply_result(
  p_match int, p_winner int, p_score text, p_reported int, p_is_bye boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  v_loser int;
  gf2 record;
  t record;
  v_champs jsonb;
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
      select * into gf2 from padel_matches
       where bracket = 'GF' and round = 2 and category = m.category;
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
    -- campeon de esta categoria
    select * into t from padel_tournament where id = 1;
    v_champs := jsonb_set(coalesce(t.champions, '{}'::jsonb), array[m.category], to_jsonb(p_winner));
    update padel_tournament set champions = v_champs, updated_at = now() where id = 1;
    -- torneo terminado cuando todas las categorias con cuadro tienen campeon
    if not exists (
      select 1 from (select distinct category from padel_matches) c
      where not (v_champs ? c.category)
    ) then
      update padel_tournament set status = 'finished', updated_at = now() where id = 1;
    end if;
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

revoke execute on function public.padel_apply_result(int,int,text,int,boolean) from public, anon, authenticated;

-- ---------- RPC publicas ----------

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
    'categories', t.categories,
    'champions', coalesce((
      select jsonb_object_agg(k.key, jsonb_build_object(
        'id', p.id, 'player1', p.player1, 'player2', p.player2))
      from jsonb_each_text(coalesce(t.champions, '{}'::jsonb)) k
      join padel_pairs p on p.id = k.value::int), '{}'::jsonb)
  );
  if t.bracket_visible then
    res := res || jsonb_build_object(
      'pairs', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'player1', p.player1, 'player2', p.player2,
                  'seed', p.seed, 'category', p.category)
                  order by coalesce(p.seed, 9999), p.id)
                 from padel_pairs p), '[]'::jsonb),
      'matches', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', m.id, 'code', m.code, 'bracket', m.bracket, 'round', m.round,
                  'position', m.position, 'stage', m.stage, 'category', m.category,
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

create or replace function public.padel_signup(
  p_player1 text, p_player2 text, p_phone text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  t record;
  v_code text;
  v_id int;
  v_cat text;
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
  v_cat := coalesce(nullif(btrim(p_category), ''), t.categories->>0, 'General');
  if not (t.categories ? v_cat) then
    raise exception 'Categoria no valida: %', v_cat;
  end if;
  select count(*) into n from padel_pairs;
  if n >= t.target_pairs then
    raise exception 'El torneo esta completo (% parejas)', t.target_pairs;
  end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from padel_pairs where secret_code = v_code);
  end loop;
  insert into padel_pairs (player1, player2, phone, secret_code, category)
  values (btrim(p_player1), btrim(p_player2), btrim(coalesce(p_phone,'')), v_code, v_cat)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'pair_id', v_id, 'code', v_code, 'position', n + 1, 'category', v_cat);
end $$;

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
    'pair', jsonb_build_object('id', p.id, 'player1', p.player1, 'player2', p.player2,
                               'seed', p.seed, 'category', p.category),
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

-- Retirada: la pareja no quiere jugar su proximo partido (p.ej. la repesca);
-- su rival pasa automaticamente con W.O.
create or replace function public.padel_withdraw(p_code text, p_match int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record;
  p record;
  m record;
  v_rival int;
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
    raise exception 'Este partido no admite retirada (estado: %)', m.status;
  end if;
  v_rival := case when m.pair1_id = p.id then m.pair2_id else m.pair1_id end;
  perform padel_apply_result(m.id, v_rival, 'W.O. (retirada)', p.id, false);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- RPC admin ----------

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
    categories        = coalesce(p->'categories', categories),
    updated_at        = now()
  where id = 1;
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
      'schedule_config', t.schedule_config, 'categories', t.categories,
      'champions', t.champions),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'player1', p.player1, 'player2', p.player2, 'phone', p.phone,
        'secret_code', p.secret_code, 'seed', p.seed, 'category', p.category,
        'created_at', p.created_at)
        order by p.category, coalesce(p.seed, 9999), p.id) from padel_pairs p), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(m) - 'reported_by'
        order by m.category, m.stage, m.bracket, m.round, m.position) from padel_matches m), '[]'::jsonb)
  );
end $$;

create or replace function public.padel_admin_add_pair(
  p_pass text, p_player1 text, p_player2 text, p_phone text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t record; v_code text; v_id int; v_cat text; n int;
begin
  perform padel_require_admin(p_pass);
  select * into t from padel_tournament where id = 1;
  select count(*) into n from padel_pairs;
  if n >= 200 then raise exception 'Maximo 200 parejas'; end if;
  if btrim(coalesce(p_player1,'')) = '' or btrim(coalesce(p_player2,'')) = '' then
    raise exception 'Faltan nombres';
  end if;
  v_cat := coalesce(nullif(btrim(p_category), ''), t.categories->>0, 'General');
  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from padel_pairs where secret_code = v_code);
  end loop;
  insert into padel_pairs (player1, player2, phone, secret_code, category)
  values (btrim(p_player1), btrim(p_player2), btrim(coalesce(p_phone,'')), v_code, v_cat)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'pair_id', v_id, 'code', v_code);
end $$;

create or replace function public.padel_admin_update_pair(
  p_pass text, p_id int, p_player1 text, p_player2 text, p_phone text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  update padel_pairs set
    player1  = coalesce(nullif(btrim(p_player1),''), player1),
    player2  = coalesce(nullif(btrim(p_player2),''), player2),
    phone    = coalesce(btrim(p_phone), phone),
    category = coalesce(nullif(btrim(p_category),''), category)
  where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.padel_admin_delete_pair(p_pass text, p_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cat text;
begin
  perform padel_require_admin(p_pass);
  select category into v_cat from padel_pairs where id = p_id;
  if exists (select 1 from padel_matches where category = v_cat) then
    raise exception 'No se puede borrar una pareja con el cuadro de su categoria ya sorteado. Reinicia ese cuadro primero.';
  end if;
  delete from padel_pairs where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Crea el cuadro de UNA categoria
create or replace function public.padel_admin_create_bracket(
  p_pass text, p_seeds jsonb, p_matches jsonb, p_category text default 'General')
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb;
begin
  perform padel_require_admin(p_pass);
  if exists (select 1 from padel_matches where category = p_category) then
    raise exception 'La categoria % ya tiene cuadro. Reinicialo antes de sortear de nuevo.', p_category;
  end if;
  update padel_pairs p set seed = (p_seeds->>(p.id::text))::int
  where p_seeds ? p.id::text;

  for item in select * from jsonb_array_elements(p_matches) loop
    insert into padel_matches
      (code, bracket, round, position, stage, category, pair1_id, pair2_id,
       slot1_void, slot2_void, winner_id, score, status,
       win_next_code, win_next_slot, lose_next_code, lose_next_slot)
    values (
      item->>'code', item->>'bracket', (item->>'round')::int, (item->>'position')::int,
      coalesce((item->>'stage')::int, 1), p_category,
      nullif(item->>'pair1_id','')::int, nullif(item->>'pair2_id','')::int,
      coalesce((item->>'slot1_void')::boolean, false),
      coalesce((item->>'slot2_void')::boolean, false),
      nullif(item->>'winner_id','')::int, coalesce(item->>'score',''),
      coalesce(item->>'status','pending'),
      item->>'win_next_code', nullif(item->>'win_next_slot','')::int,
      item->>'lose_next_code', nullif(item->>'lose_next_slot','')::int);
  end loop;

  update padel_tournament
     set status = 'in_progress', updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true,
    'matches', (select count(*) from padel_matches where category = p_category));
end $$;

-- Reinicia el cuadro de una categoria (o todos si p_category es null)
create or replace function public.padel_admin_reset_bracket(p_pass text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record;
begin
  perform padel_require_admin(p_pass);
  if p_category is null then
    delete from padel_matches where true;
    update padel_pairs set seed = null where true;
    update padel_tournament
       set champions = '{}'::jsonb, status = 'registration',
           bracket_visible = false, updated_at = now()
     where id = 1;
  else
    delete from padel_matches where category = p_category;
    update padel_pairs set seed = null where category = p_category;
    update padel_tournament
       set champions = champions - p_category, updated_at = now()
     where id = 1;
    if not exists (select 1 from padel_matches) then
      update padel_tournament set status = 'registration', updated_at = now() where id = 1;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;
