-- ---------------------------------------------------------------------------
-- Retira el andamiaje de la prueba de aislamiento de RLS.
--
-- Durante la puesta en marcha se creó una función `__rls_probe` para verificar
-- que un usuario no miembro no ve ni escribe nada. La prueba pasó, pero la
-- función se creó sin revocar permisos y heredó el EXECUTE para PUBLIC: tal
-- cual quedó, un usuario autenticado podía llamarla con el uuid de otro y
-- adoptar su identidad durante el resto de la transacción.
--
-- En una instalación nueva esto no encuentra nada y no hace nada. Se deja como
-- migración, y no como script suelto, para que no dependa de que alguien se
-- acuerde de ejecutarlo.
-- ---------------------------------------------------------------------------

drop function if exists public.__rls_probe(uuid);

-- Sala sintética de la prueba y sus tres usuarios. La sala real no se toca:
-- los identificadores de abajo son fijos y solo los usó aquella prueba.
delete from public.messages
 where room_id = 'bbbbbbbb-0000-4000-8000-000000000001';

delete from public.room_members
 where room_id = 'bbbbbbbb-0000-4000-8000-000000000001';

delete from public.rooms
 where id = 'bbbbbbbb-0000-4000-8000-000000000001';

delete from public.profiles
 where id in ('aaaaaaaa-0000-4000-8000-000000000001',
              'aaaaaaaa-0000-4000-8000-000000000002',
              'aaaaaaaa-0000-4000-8000-000000000003');

delete from auth.users
 where email in ('probe-es@invalid.test',
                 'probe-bg@invalid.test',
                 'probe-intruso@invalid.test');
