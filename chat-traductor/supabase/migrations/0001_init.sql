-- ---------------------------------------------------------------------------
-- Chat traductor ES <-> BG — esquema inicial
--
-- Ejecutar en el SQL Editor de Supabase (o `supabase db push`).
-- Es idempotente: se puede volver a lanzar sin romper nada.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

-- Perfil de cada participante, 1:1 con auth.users
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  lang         text not null check (lang in ('es','bg')),
  created_at   timestamptz not null default now()
);

-- Sala de conversación (de momento solo habrá una)
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Pertenencia a sala
create table if not exists public.room_members (
  room_id    uuid references public.rooms(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, profile_id)
);

-- Mensajes
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id),
  kind         text not null default 'text' check (kind in ('text','voice')),
  source_lang  text not null check (source_lang in ('es','bg')),
  source_text  text not null,
  translations jsonb not null default '{}'::jsonb,
  status       text not null default 'pending'
                 check (status in ('pending','translated','failed')),
  error_detail text,
  media_url    text,           -- reservado para voz, siempre null por ahora
  client_id    uuid not null,  -- generado en el cliente, evita duplicados
  created_at   timestamptz not null default now()
);

create index if not exists messages_room_created_idx
  on public.messages (room_id, created_at desc);
create unique index if not exists messages_client_id_idx
  on public.messages (client_id);

-- Indicador de "escribiendo". El camino principal es Broadcast (§7 del brief);
-- esta tabla queda como reserva.
create table if not exists public.typing_state (
  room_id    uuid references public.rooms(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Helpers SECURITY DEFINER
--
-- Las políticas de `room_members` necesitan consultar `room_members`. Hacerlo
-- directamente provoca recursión infinita en RLS, así que la comprobación vive
-- en funciones SECURITY DEFINER que saltan RLS de forma controlada.
-- ---------------------------------------------------------------------------

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.profile_id = auth.uid()
  );
$$;

create or replace function public.shares_room_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members me
    join public.room_members other on other.room_id = me.room_id
    where me.profile_id = auth.uid()
      and other.profile_id = p_profile_id
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.shares_room_with(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.shares_room_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.messages     enable row level security;
alter table public.typing_state enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles_select_self_or_roommate" on public.profiles;
create policy "profiles_select_self_or_roommate"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_room_with(id));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- rooms ---------------------------------------------------------------------
drop policy if exists "rooms_select_member" on public.rooms;
create policy "rooms_select_member"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

-- room_members --------------------------------------------------------------
drop policy if exists "room_members_select_member" on public.room_members;
create policy "room_members_select_member"
  on public.room_members for select
  to authenticated
  using (public.is_room_member(room_id));

-- messages ------------------------------------------------------------------
-- Sin políticas de UPDATE ni DELETE: con RLS activo, la ausencia de política
-- las deniega. Solo la Edge Function (service_role) puede escribir traducciones.
drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member"
  on public.messages for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "messages_insert_member_as_self" on public.messages;
create policy "messages_insert_member_as_self"
  on public.messages for insert
  to authenticated
  with check (
    public.is_room_member(room_id)
    and sender_id = auth.uid()
    and status = 'pending'
    and translations = '{}'::jsonb
    and media_url is null
  );

-- typing_state --------------------------------------------------------------
drop policy if exists "typing_select_member" on public.typing_state;
create policy "typing_select_member"
  on public.typing_state for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "typing_insert_self" on public.typing_state;
create policy "typing_insert_self"
  on public.typing_state for insert
  to authenticated
  with check (profile_id = auth.uid() and public.is_room_member(room_id));

drop policy if exists "typing_update_self" on public.typing_state;
create policy "typing_update_self"
  on public.typing_state for update
  to authenticated
  using (profile_id = auth.uid() and public.is_room_member(room_id))
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
--
-- `replica identity full` hace que los payloads de UPDATE lleguen completos,
-- que es lo que necesita el cliente para sustituir la burbuja con la traducción.
-- ---------------------------------------------------------------------------

alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
