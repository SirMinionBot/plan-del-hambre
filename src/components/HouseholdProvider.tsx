import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { HouseholdContext, type HouseholdState, type Member } from '../hooks/useHousehold'
import { useAuth } from '../hooks/useAuth'
import type { Accent, Household } from '../types/db'

type Snapshot = Omit<HouseholdState, 'refresh'>

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id ?? null
  const [state, setState] = useState<Snapshot>({
    household: null,
    me: null,
    partner: null,
    loading: true,
  })

  // fetch puro: devuelve el snapshot sin tocar estado (los setters van en .then
  // o tras await fuera de efectos)
  const fetchSnapshot = useCallback(async (): Promise<Snapshot> => {
    const empty: Snapshot = { household: null, me: null, partner: null, loading: false }
    if (!uid) return empty

    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, accent, households(*)')
      .eq('user_id', uid)
      .maybeSingle()

    if (!membership) return empty

    const { data: members } = await supabase
      .from('household_members')
      .select('user_id, accent')
      .eq('household_id', membership.household_id)

    const ids = (members ?? []).map((m) => m.user_id)
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)

    const toMember = (m: { user_id: string; accent: Accent }): Member => ({
      user_id: m.user_id,
      accent: m.accent,
      profile: (profiles ?? []).find((p) => p.id === m.user_id)!,
    })

    const all = (members ?? []).map(toMember)
    return {
      household: membership.households as unknown as Household,
      me: all.find((m) => m.user_id === uid) ?? null,
      partner: all.find((m) => m.user_id !== uid) ?? null,
      loading: false,
    }
  }, [uid])

  const refresh = useCallback(async () => {
    setState(await fetchSnapshot())
  }, [fetchSnapshot])

  useEffect(() => {
    let cancelled = false
    void fetchSnapshot().then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [fetchSnapshot])

  return <HouseholdContext.Provider value={{ ...state, refresh }}>{children}</HouseholdContext.Provider>
}
