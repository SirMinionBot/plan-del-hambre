import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Banner } from '../components/ui/Banner'

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  // vuelve a la ruta que provocó el desvío a /login (refresh con token
  // caducado, deep link...); sin ella, a la portada
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from
  if (session) return <Navigate to={from ? from.pathname + from.search : '/'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })
    if (error) setError(error.message)
    setBusy(false)
  }

  async function forgotPassword() {
    if (!email) {
      setError('Escribe tu email arriba y vuelve a pulsar')
      return
    }
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + import.meta.env.BASE_URL + 'reset',
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  async function googleLogin() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl">Plan del hambre</h1>
      <p className="font-bold uppercase">Qué comemos esta semana, sin discutir.</p>

      <div className="grid grid-cols-2">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`border-2 border-ink py-2 font-bold uppercase ${mode === m ? 'bg-ink text-paper' : 'bg-white'}`}
          >
            {m === 'login' ? 'Entrar' : 'Registro'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="border-brutal shadow-brutal-lg flex flex-col gap-4 bg-white p-6">
        {mode === 'register' && (
          <Input label="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <Banner variant="error">{error}</Banner>}
        {sent && <Banner variant="ok">Enviado — revisa tu correo y sigue el enlace</Banner>}
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </Button>
        {mode === 'login' && (
          <Button variant="ghost" type="button" onClick={forgotPassword} disabled={busy}>
            He olvidado la contraseña
          </Button>
        )}
        <p className="text-center text-xs font-bold uppercase opacity-60">— o —</p>
        <Button type="button" onClick={googleLogin} disabled={busy}>
          Entrar con Google
        </Button>
      </form>
    </div>
  )
}
