import { useCallback, useEffect, useState } from 'react'
import { CONFIGURED_ROOM_ID, supabase } from '../lib/supabase'
import type { Profile, Room } from '../lib/types'

interface Workspace {
  loading: boolean
  profile: Profile | null
  room: Room | null
  members: Profile[]
  error: string | null
}

const initial: Workspace = {
  loading: true,
  profile: null,
  room: null,
  members: [],
  error: null,
}

/**
 * Carga el perfil del usuario, su sala y los miembros de esa sala.
 * RLS garantiza que solo se ven las salas propias, así que "la primera sala"
 * es la sala del usuario mientras solo haya una.
 */
export function useWorkspace(userId: string | null) {
  const [state, setState] = useState<Workspace>(initial)

  const load = useCallback(async () => {
    if (!userId) {
      setState({ ...initial, loading: false })
      return
    }
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle<Profile>()

    if (profileError) {
      setState({ ...initial, loading: false, error: profileError.message })
      return
    }
    if (!profile) {
      // Sin perfil todavía: la app pedirá nombre e idioma.
      setState({ ...initial, loading: false })
      return
    }

    let roomQuery = supabase.from('rooms').select('*').order('created_at').limit(1)
    if (CONFIGURED_ROOM_ID) {
      roomQuery = supabase
        .from('rooms')
        .select('*')
        .eq('id', CONFIGURED_ROOM_ID)
        .limit(1)
    }

    const { data: rooms, error: roomError } = await roomQuery.returns<Room[]>()
    if (roomError) {
      setState({ ...initial, loading: false, profile, error: roomError.message })
      return
    }

    const room = rooms?.[0] ?? null
    if (!room) {
      setState({ loading: false, profile, room: null, members: [], error: null })
      return
    }

    const { data: memberRows, error: membersError } = await supabase
      .from('room_members')
      .select('profiles!inner(*)')
      .eq('room_id', room.id)

    if (membersError) {
      setState({ loading: false, profile, room, members: [profile], error: null })
      return
    }

    const members = (memberRows ?? [])
      .map((row) => (row as unknown as { profiles: Profile }).profiles)
      .filter(Boolean)

    setState({
      loading: false,
      profile,
      room,
      members: members.length ? members : [profile],
      error: null,
    })
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, reload: load }
}
