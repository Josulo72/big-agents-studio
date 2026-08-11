-- ---------------------------------------------------------------------------
-- Crea la sala y sus dos plazas. No crea usuarios: no hay cuentas que crear.
--
-- Cada uno abre la app, toca su nombre una vez en su dispositivo y queda
-- vinculado a esa plaza para siempre. La primera sesión que reclama una plaza
-- se la queda, así que reclamadlas las dos antes de que la URL circule.
--
-- Requisito previo en el panel:
--   Authentication → Sign In / Providers → "Allow anonymous sign-ins" activado.
--
-- Es idempotente: se puede relanzar sin romper nada.
-- ---------------------------------------------------------------------------

do $$
declare
  v_room_name text := 'Casa';
  v_name_es   text := 'Jorge';
  v_name_bg   text := 'Diana';
  v_room      uuid;
begin
  select id into v_room from public.rooms where name = v_room_name limit 1;
  if v_room is null then
    insert into public.rooms (name) values (v_room_name) returning id into v_room;
  end if;

  insert into public.room_slots (room_id, lang, display_name)
  values (v_room, 'es', v_name_es),
         (v_room, 'bg', v_name_bg)
  on conflict (room_id, lang) do update
     set display_name = excluded.display_name;

  raise notice 'Sala lista. VITE_ROOM_ID (opcional) = %', v_room;
end $$;

select r.id as room_id,
       r.name,
       s.lang,
       s.display_name,
       case when s.claimed_by is null then 'libre' else 'ocupada' end as estado
  from public.rooms r
  join public.room_slots s on s.room_id = r.id
 order by r.created_at, s.lang;

-- Para liberar una plaza reclamada por error (borra su perfil y sus mensajes
-- quedan huérfanos, así que úsalo solo durante la puesta en marcha):
--   select public.release_slot('<room_id>', 'es');
