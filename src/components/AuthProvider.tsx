import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthState } from '../hooks/useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
