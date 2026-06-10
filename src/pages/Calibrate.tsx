import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Banner, Loading } from '../components/ui/Banner'
import { Tag } from '../components/ui/Tag'
import type { Recipe } from '../types/db'

const SAMPLE_SIZE = 24

/** Muestra variada: round-robin por ingrediente principal para no enseñar 24 pastas. */
function diverseSample(recipes: Recipe[], n: number): Recipe[] {
  const groups = new Map<string, Recipe[]>()
  for (const r of recipes) {
    const key = r.main_ingredient ?? 'otros'
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const lists = [...groups.values()]
  const out: Recipe[] = []
  let i = 0
  while (out.length < n && lists.some((l) => l.length > 0)) {
    const list = lists[i % lists.length]
    const item = list.shift()
    if (item) out.push(item)
    i++
  }
  return out
}

export function CalibratePage() {
  const { session } = useAuth()
  const uid = session!.user.id
  const [queue, setQueue] = useState<Recipe[] | null>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    void (async () => {
      const [{ data: recipes }, { data: rated }] = await Promise.all([
        supabase.from('recipes').select('*').is('household_id', null),
        supabase.from('recipe_ratings').select('recipe_id').eq('user_id', uid),
      ])
      const ratedIds = new Set((rated ?? []).map((r) => r.recipe_id))
      const unrated = (recipes ?? []).filter((r) => !ratedIds.has(r.id))
      setQueue(diverseSample(unrated, SAMPLE_SIZE))
    })()
  }, [uid])

  async function answer(action: 'veto' | 2 | 4 | 5 | 'skip') {
    const recipe = queue![idx]
    if (action !== 'skip') {
      await supabase.from('recipe_ratings').upsert(
        action === 'veto'
          ? { user_id: uid, recipe_id: recipe.id, rating: null, vetoed: true }
          : { user_id: uid, recipe_id: recipe.id, rating: action, vetoed: false },
      )
    }
    setIdx(idx + 1)
  }

  if (!queue) return <Loading />

  if (queue.length === 0 || idx >= queue.length) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <Banner variant="ok">Listo — el recomendador ya te conoce</Banner>
        <p className="font-bold uppercase">
          Tus respuestas alimentan la puntuación de gusto. Recuerda: tu pareja también debe calibrar las suyas.
        </p>
        <Link to="/planificar">
          <Button variant="primary" className="w-full">
            Planificar la semana
          </Button>
        </Link>
        <Link to="/" className="text-center text-xs font-bold uppercase underline">
          ← Volver a hoy
        </Link>
      </div>
    )
  }

  const recipe = queue[idx]

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2>¿Te gusta?</h2>
        <span className="font-bold" data-numeric>
          {idx + 1}/{queue.length}
        </span>
      </div>

      <div className="border-brutal shadow-brutal-lg flex min-h-48 flex-col gap-3 bg-white p-6">
        <p className="text-2xl font-bold uppercase">{recipe.name}</p>
        {recipe.description && <p className="text-sm">{recipe.description}</p>}
        <p className="mt-auto flex flex-wrap gap-1">
          <Tag>{recipe.prep_minutes + recipe.cook_minutes} min</Tag>
          {recipe.tags.slice(0, 4).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" onClick={() => void answer('veto')}>
          Ni de broma
        </Button>
        <Button onClick={() => void answer(2)}>Meh</Button>
        <Button onClick={() => void answer(4)}>Sí</Button>
        <Button variant="primary" onClick={() => void answer(5)}>
          Favorita
        </Button>
      </div>
      <Button variant="ghost" onClick={() => void answer('skip')}>
        No la conozco — saltar
      </Button>
    </div>
  )
}
