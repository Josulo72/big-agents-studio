-- ---------------------------------------------------------------------------
-- Reacciones
--
-- Una por persona y mensaje, sustituible: tocar otro emoji cambia el tuyo,
-- tocar el mismo lo quita. Es como funcionan las apps de mensajería y evita
-- que una conversación de dos se llene de emoji repetidos.
--
-- Ejecutar entero en el SQL Editor. Es idempotente.
-- ---------------------------------------------------------------------------

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Desnormalizado a propósito: Realtime filtra por columna, y sin esto no se
  -- puede escuchar solo lo de la propia sala.
  room_id    uuid not null references public.rooms(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index if not exists message_reactions_room_idx
  on public.message_reactions (room_id, message_id);

alter table public.message_reactions enable row level security;

-- Que el mensaje pertenezca de verdad a la sala que se declara. Sin esto,
-- alguien podría reaccionar a un mensaje ajeno declarando su propia sala.
create or replace function public.message_in_room(p_message uuid, p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    where m.id = p_message and m.room_id = p_room
  );
$$;

revoke all on function public.message_in_room(uuid, uuid) from public;
grant execute on function public.message_in_room(uuid, uuid) to authenticated;

drop policy if exists "reactions_select_member" on public.message_reactions;
create policy "reactions_select_member"
  on public.message_reactions for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "reactions_insert_own" on public.message_reactions;
create policy "reactions_insert_own"
  on public.message_reactions for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_room_member(room_id)
    and public.message_in_room(message_id, room_id)
  );

drop policy if exists "reactions_update_own" on public.message_reactions;
create policy "reactions_update_own"
  on public.message_reactions for update
  to authenticated
  using (profile_id = auth.uid() and public.is_room_member(room_id))
  with check (profile_id = auth.uid());

drop policy if exists "reactions_delete_own" on public.message_reactions;
create policy "reactions_delete_own"
  on public.message_reactions for delete
  to authenticated
  using (profile_id = auth.uid());

-- Realtime. `replica identity full` es imprescindible aquí: sin ella, el evento
-- de borrado no trae `room_id` y el filtro por sala se lo comería.
alter table public.message_reactions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
