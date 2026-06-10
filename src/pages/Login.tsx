import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Banner } from '../components/ui/Banner'

export function LoginPage() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

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
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </Button>
      </form>
    </div>
  )
}
