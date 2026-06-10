import { useState } from 'react'
import { searchSpoonacular, importSpoonacularRecipe, type SpoonacularHit } from '../lib/importers/spoonacular'
import { useAuth } from '../hooks/useAuth'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Banner, Loading } from './ui/Banner'

export function SpoonacularImport({ onClose }: { onClose: (imported: boolean) => void }) {
  const { session } = useAuth()
  const { household } = useHousehold()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SpoonacularHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function search() {
    setBusy(true)
    setError(null)
    try {
      setHits(await searchSpoonacular(query))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en la búsqueda')
    }
    setBusy(false)
  }

  async function doImport(hit: SpoonacularHit) {
    setBusy(true)
    setError(null)
    try {
      await importSpoonacularRecipe(hit.id, household!.id, session!.user.id)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={() => onClose(done)}>
      <div
        className="border-brutal shadow-brutal-lg flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Importar de Spoonacular</h2>
        <p className="text-xs font-bold uppercase">Las recetas llegan en inglés y se guardan como receta del hogar, editable.</p>
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="pasta, curry..." />
          <Button onClick={search} disabled={busy || !query}>
            Buscar
          </Button>
        </div>
        {busy && <Loading />}
        {error && <Banner variant="error">{error}</Banner>}
        {done && <Banner variant="ok">Importada — la tienes en recetas del hogar</Banner>}
        {hits && !busy && (
          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.id} className="border-brutal-thin flex items-center justify-between gap-2 bg-white p-2">
                <span className="text-sm font-bold">{h.title}</span>
                <Button onClick={() => doImport(h)} disabled={busy}>
                  Importar
                </Button>
              </li>
            ))}
            {hits.length === 0 && <p className="text-xs font-bold uppercase">Sin resultados</p>}
          </ul>
        )}
        <Button onClick={() => onClose(done)}>Cerrar</Button>
      </div>
    </div>
  )
}
