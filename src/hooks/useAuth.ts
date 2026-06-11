import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export interface AuthState {
  session: Session | null
  loading: boolean
}

/** Lo rellena <AuthProvider> (src/components/AuthProvider.tsx). */
export const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function useAuth() {
  return useContext(AuthContext)
}
