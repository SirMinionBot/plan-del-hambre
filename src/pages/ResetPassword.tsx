import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Banner, Loading } from '../components/ui/Banner'

/**
 * Destino del enlace de recuperación del email. Supabase abre esta URL con el
 * token en el hash y supabase-js crea la sesión sola (detectSessionInUrl).
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    navigate('/')
  }

  if (loading) return <Loading />

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl">Nueva contraseña</h1>
      {!session ? (
        <>
          <Banner variant="error">Enlace caducado o no válido</Banner>
          <p className="font-bold uppercase">
            Pide otro desde la pantalla de entrada con "he olvidado la contraseña".
          </p>
          <Link to="/login" className="text-xs font-bold uppercase underline">
            ← Volver a entrar
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="border-brutal shadow-brutal-lg flex flex-col gap-4 bg-white p-6">
          <Input
            label="Nueva contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {error && <Banner variant="error">{error}</Banner>}
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Un momento...' : 'Guardar y entrar'}
          </Button>
        </form>
      )}
    </div>
  )
}
