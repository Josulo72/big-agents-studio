-- ---------------------------------------------------------------------------
-- Alta de los dos participantes y de la sala única.
--
-- Antes de ejecutar esto:
--   1. Authentication → Providers → Email: desactivar "Enable Sign Ups".
--   2. Authentication → Users → "Add user" dos veces (Auto Confirm User = on),
--      una por cada correo. No hace falta contraseña: se entra por magic link.
--
-- Después sustituye los dos correos de abajo y lanza el script entero.
-- Es idempotente.
-- ---------------------------------------------------------------------------

do $$
declare
  v_email_es   text := 'persona-es@example.com';   -- <-- cambiar
  v_email_bg   text := 'persona-bg@example.com';   -- <-- cambiar
  v_name_es    text := 'Nombre ES';                -- <-- cambiar
  v_name_bg    text := 'Име БГ';                   -- <-- cambiar
  v_room_name  text := 'Casa';
  v_id_es      uuid;
  v_id_bg      uuid;
  v_room       uuid;
begin
  select id into v_id_es from auth.users where lower(email) = lower(v_email_es);
  select id into v_id_bg from auth.users where lower(email) = lower(v_email_bg);

  if v_id_es is null then
    raise exception 'No existe el usuario %. Créalo antes en Authentication → Users.', v_email_es;
  end if;
  if v_id_bg is null then
    raise exception 'No existe el usuario %. Créalo antes en Authentication → Users.', v_email_bg;
  end if;

  insert into public.profiles (id, display_name, lang)
  values (v_id_es, v_name_es, 'es')
  on conflict (id) do update set display_name = excluded.display_name,
                                 lang = excluded.lang;

  insert into public.profiles (id, display_name, lang)
  values (v_id_bg, v_name_bg, 'bg')
  on conflict (id) do update set display_name = excluded.display_name,
                                 lang = excluded.lang;

  select id into v_room from public.rooms where name = v_room_name limit 1;
  if v_room is null then
    insert into public.rooms (name) values (v_room_name) returning id into v_room;
  end if;

  insert into public.room_members (room_id, profile_id)
  values (v_room, v_id_es), (v_room, v_id_bg)
  on conflict do nothing;

  raise notice 'Sala lista. VITE_ROOM_ID (opcional) = %', v_room;
end $$;

-- El id de la sala, para copiarlo al .env si se quiere fijar:
select id as room_id, name from public.rooms;
