-- ---------------------------------------------------------------------------
-- Notificaciones push
--
-- Una fila por dispositivo suscrito. El endpoint es la clave: el navegador lo
-- regenera si caduca, así que es lo único estable que identifica la suscripción.
--
-- Las claves `p256dh` y `auth` las genera el navegador y solo sirven para
-- cifrar el contenido de ese push concreto: no dan acceso a nada.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- Cada uno gestiona solo sus propios dispositivos. Quien envía los push es la
-- Edge Function con la service_role, que salta RLS.
drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (profile_id = auth.uid());
