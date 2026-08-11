-- ---------------------------------------------------------------------------
-- Acceso sin login
--
-- Nadie escribe correo ni contraseña. El navegador abre una sesión anónima de
-- Supabase (que sí da un `auth.uid()` real, y por tanto mantiene el RLS en pie)
-- y el usuario solo toca su nombre una vez por dispositivo.
--
-- Las plazas de la sala se reparten por orden de llegada: la primera sesión que
-- reclama la plaza española se queda con ella, y a partir de ahí esa plaza está
-- cerrada. Hay que reclamar las dos antes de que la URL circule.
--
-- Requisito en el panel: Authentication → Sign In / Providers → activar
-- "Allow anonymous sign-ins".
-- ---------------------------------------------------------------------------

create table if not exists public.room_slots (
  room_id      uuid not null references public.rooms(id) on delete cascade,
  lang         text not null check (lang in ('es','bg')),
  display_name text not null,
  claimed_by   uuid references auth.users(id) on delete set null,
  claimed_at   timestamptz,
  primary key (room_id, lang),
  unique (claimed_by)
);

alter table public.room_slots enable row level security;

-- Solo se ven las plazas libres y la propia. Así, una vez reclamadas las dos,
-- quien llegue de fuera no ve ni los nombres: ve una sala sin plazas.
drop policy if exists "slots_select_free_or_mine" on public.room_slots;
create policy "slots_select_free_or_mine"
  on public.room_slots for select
  to authenticated
  using (claimed_by is null or claimed_by = auth.uid());

-- El reparto lo hace solo esta función; nadie escribe la tabla directamente.
create or replace function public.claim_slot(p_room uuid, p_lang text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_slot    public.room_slots;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'sin sesión' using errcode = '28000';
  end if;

  -- ¿Ya tengo plaza en esta sala? Entonces esto es idempotente: reabrir la app
  -- en el mismo dispositivo no debe fallar ni robar la otra plaza.
  select * into v_slot
    from public.room_slots
   where room_id = p_room and claimed_by = v_uid;

  if not found then
    -- `for update` serializa a los dos que reclamen a la vez.
    select * into v_slot
      from public.room_slots
     where room_id = p_room and lang = p_lang
     for update;

    if not found then
      raise exception 'plaza inexistente' using errcode = 'P0002';
    end if;

    if v_slot.claimed_by is not null then
      raise exception 'plaza ya ocupada' using errcode = '23505';
    end if;

    update public.room_slots
       set claimed_by = v_uid, claimed_at = now()
     where room_id = p_room and lang = p_lang;
  end if;

  insert into public.profiles (id, display_name, lang)
  values (v_uid, v_slot.display_name, v_slot.lang)
  on conflict (id) do update
     set display_name = excluded.display_name,
         lang         = excluded.lang
  returning * into v_profile;

  insert into public.room_members (room_id, profile_id)
  values (p_room, v_uid)
  on conflict do nothing;

  return v_profile;
end $$;

revoke all on function public.claim_slot(uuid, text) from public;
grant execute on function public.claim_slot(uuid, text) to authenticated;

-- Ya no hace falta que el cliente cree su propio perfil: lo hace `claim_slot`,
-- que además es lo único que otorga pertenencia a la sala.
drop policy if exists "profiles_insert_self" on public.profiles;

-- ---------------------------------------------------------------------------
-- Liberar una plaza (por si se reclama por error o desde el dispositivo que no
-- era). Ejecutar desde el SQL Editor; borra también el perfil y su pertenencia.
--
--   select public.release_slot('<room_id>', 'es');
-- ---------------------------------------------------------------------------
create or replace function public.release_slot(p_room uuid, p_lang text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  select claimed_by into v_uid
    from public.room_slots
   where room_id = p_room and lang = p_lang;

  update public.room_slots
     set claimed_by = null, claimed_at = null
   where room_id = p_room and lang = p_lang;

  if v_uid is not null then
    delete from public.room_members where profile_id = v_uid and room_id = p_room;
    delete from public.profiles where id = v_uid;
  end if;
end $$;

revoke all on function public.release_slot(uuid, text) from public;
revoke all on function public.release_slot(uuid, text) from authenticated;
