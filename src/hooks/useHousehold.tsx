import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Accent, Household, Profile } from '../types/db'
import { useAuth } from './useAuth'

export interface Member {
  user_id: string
  accent: Accent
  profile: Profile
}

interface HouseholdState {
  household: Household | null
  me: Member | null
  partner: Member | null
  loading: boolean
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  me: null,
  partner: null,
  loading: true,
  refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id ?? null
  const [state, setState] = useState<Omit<HouseholdState, 'refresh'>>({
    household: null,
    me: null,
    partner: null,
    loading: true,
  })

  const refresh = useCallback(async () => {
    if (!uid) {
      setState({ household: null, me: null, partner: null, loading: false })
      return
    }
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, accent, households(*)')
      .eq('user_id', uid)
      .maybeSingle()

    if (!membership) {
      setState({ household: null, me: null, partner: null, loading: false })
      return
    }

    const { data: members } = await supabase
      .from('household_members')
      .select('user_id, accent')
      .eq('household_id', membership.household_id)

    const ids = (members ?? []).map((m) => m.user_id)
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)

    const toMember = (m: { user_id: string; accent: Accent }): Member => ({
      user_id: m.user_id,
      accent: m.accent,
      profile: (profiles ?? []).find((p) => p.id === m.user_id) as Profile,
    })

    const all = (members ?? []).map(toMember)
    setState({
      household: membership.households as unknown as Household,
      me: all.find((m) => m.user_id === uid) ?? null,
      partner: all.find((m) => m.user_id !== uid) ?? null,
      loading: false,
    })
  }, [uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return <HouseholdContext.Provider value={{ ...state, refresh }}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  return useContext(HouseholdContext)
}

/** Colores tailwind por acento, para clases dinámicas. */
export const accentBg: Record<Accent, string> = { a: 'bg-person-a', b: 'bg-person-b' }
export const accentText: Record<Accent, string> = { a: 'text-person-a', b: 'text-person-b' }
