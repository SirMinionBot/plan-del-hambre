import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Banner, Loading } from '../components/ui/Banner'

export function HouseholdSetupPage() {
  const { household, loading, refresh } = useHousehold()
  const navigate = useNavigate()
  const location = useLocation()
  // ruta que provocó el desvío a /hogar; al resolverse el hogar se restaura
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from
  const back = from ? from.pathname + from.search : '/'
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // pantalla de carga mientras se resuelve el hogar: nada de enseñar el
  // formulario de crear/unirse a quien ya tiene casa
  if (loading) return <Loading />
  if (household) return <Navigate to={back} replace />

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    await refresh()
    navigate(back)
  }

  function create(e: FormEvent) {
    e.preventDefault()
    void run(() => supabase.rpc('create_household', { household_name: name }))
  }

  function join(e: FormEvent) {
    e.preventDefault()
    void run(() => supabase.rpc('join_household', { code }))
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl">Vuestro hogar</h1>
      <p className="font-bold uppercase">El calendario, las recetas y la compra se comparten por hogar.</p>

      <form onSubmit={create} className="border-brutal shadow-brutal flex flex-col gap-4 bg-white p-6">
        <h2>Crear hogar</h2>
        <Input label="Nombre del hogar" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button variant="primary" type="submit" disabled={busy}>
          Crear y obtener código
        </Button>
      </form>

      <form onSubmit={join} className="border-brutal shadow-brutal flex flex-col gap-4 bg-white p-6">
        <h2>Unirse con código</h2>
        <Input
          label="Código de invitación"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          required
        />
        <Button type="submit" disabled={busy}>
          Unirme
        </Button>
      </form>

      {error && <Banner variant="error">{error}</Banner>}

      <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
        Salir
      </Button>
    </div>
  )
}
