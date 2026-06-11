import { createContext, useContext } from 'react'
import type { Accent, Household, Profile } from '../types/db'

export interface Member {
  user_id: string
  accent: Accent
  profile: Profile
}

export interface HouseholdState {
  household: Household | null
  me: Member | null
  partner: Member | null
  loading: boolean
  refresh: () => Promise<void>
}

/** Lo rellena <HouseholdProvider> (src/components/HouseholdProvider.tsx). */
export const HouseholdContext = createContext<HouseholdState>({
  household: null,
  me: null,
  partner: null,
  loading: true,
  refresh: async () => {},
})

export function useHousehold() {
  return useContext(HouseholdContext)
}

/** Colores tailwind por acento, para clases dinámicas. */
export const accentBg: Record<Accent, string> = { a: 'bg-person-a', b: 'bg-person-b' }
export const accentText: Record<Accent, string> = { a: 'text-person-a', b: 'text-person-b' }
