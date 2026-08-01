-- Restablecimiento total del torneo: borra cuadros y parejas, conserva
-- nombre, club, categorias, pistas y contraseña. Deja la inscripcion abierta.
create or replace function public.padel_admin_full_reset(p_pass text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform padel_require_admin(p_pass);
  delete from padel_matches where true;
  delete from padel_pairs where true;
  update padel_tournament
     set status = 'registration',
         registration_open = true,
         bracket_visible = false,
         champions = '{}'::jsonb,
         champion_id = null,
         schedule_config = jsonb_set(schedule_config, '{days}', '[]'::jsonb),
         updated_at = now()
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;
