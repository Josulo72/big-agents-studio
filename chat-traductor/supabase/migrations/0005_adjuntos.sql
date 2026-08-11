-- ---------------------------------------------------------------------------
-- Adjuntos: imágenes y archivos
--
-- El esquema ya reservaba `kind` y `media_url`. Aquí se abren de verdad y se
-- crea el almacén, que es privado: los ficheros no se sirven por URL pública,
-- sino con enlaces firmados de vida corta que solo obtienen los miembros de la
-- sala.
--
-- Ejecutar entero en el SQL Editor. Es idempotente.
-- ---------------------------------------------------------------------------

-- 1. Tipos de mensaje y metadatos del adjunto -------------------------------

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'voice', 'image', 'file'));

alter table public.messages add column if not exists media_name   text;
alter table public.messages add column if not exists media_mime   text;
alter table public.messages add column if not exists media_size   bigint;
alter table public.messages add column if not exists media_width  integer;
alter table public.messages add column if not exists media_height integer;

-- 2. Insertar mensajes con adjunto ------------------------------------------
-- Antes se exigía `media_url is null`, que cerraba la puerta del todo. Ahora
-- se exige coherencia: un mensaje de texto no lleva fichero, y uno de fichero
-- no viene vacío de ruta.

drop policy if exists "messages_insert_member_as_self" on public.messages;
create policy "messages_insert_member_as_self"
  on public.messages for insert
  to authenticated
  with check (
    public.is_room_member(room_id)
    and sender_id = auth.uid()
    and status = 'pending'
    and translations = '{}'::jsonb
    and (
      (kind = 'text' and media_url is null)
      or (kind in ('image', 'file', 'voice') and media_url is not null)
    )
  );

-- 3. Almacén ----------------------------------------------------------------
-- Privado. Sin esto, cualquiera con la dirección del fichero lo vería.

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 26214400)   -- 25 MB por fichero
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- 4. Quién puede tocar qué fichero ------------------------------------------
-- Los ficheros se guardan como `<room_id>/<nombre>`, así que la primera
-- carpeta de la ruta dice a qué sala pertenecen y `is_room_member` decide.

create or replace function public.media_room_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  -- Un nombre que no empiece por un uuid de sala no pertenece a nadie.
  begin
    v_room := ((storage.foldername(p_name))[1])::uuid;
  exception when others then
    return false;
  end;
  return public.is_room_member(v_room);
end $$;

revoke all on function public.media_room_ok(text) from public;
grant execute on function public.media_room_ok(text) to authenticated;

drop policy if exists "media_select_member" on storage.objects;
create policy "media_select_member"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'media' and public.media_room_ok(name));

drop policy if exists "media_insert_member" on storage.objects;
create policy "media_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and public.media_room_ok(name)
    and owner = auth.uid()
  );

-- Sin update ni delete desde el cliente: un adjunto enviado no se retoca, igual
-- que un mensaje.
