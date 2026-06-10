import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { Loading, EmptyState } from '../components/ui/Banner'
import { Tag } from '../components/ui/Tag'
import { SpoonacularImport } from '../components/SpoonacularImport'
import { spoonacularKey } from '../lib/supabase'
import type { Recipe, RecipeRating } from '../types/db'

const ALL_TAGS = ['desayuno', 'rapida', 'sin-horno', 'horno', 'veggie', 'ensalada', 'guiso', 'fiambrera', 'batch', 'dulce', 'importada']

export function RecipesPage() {
  const { me, partner } = useHousehold()
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [ratings, setRatings] = useState<RecipeRating[]>([])
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [maxTime, setMaxTime] = useState('')
  const [showImport, setShowImport] = useState(false)

  async function load() {
    const [{ data: r }, { data: rat }] = await Promise.all([
      supabase.from('recipes').select('*').order('name'),
      supabase.from('recipe_ratings').select('*'),
    ])
    setRecipes(r ?? [])
    setRatings(rat ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (!recipes) return []
    return recipes.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
      if (tag && !r.tags.includes(tag)) return false
      if (maxTime && r.prep_minutes + r.cook_minutes > Number(maxTime)) return false
      return true
    })
  }, [recipes, search, tag, maxTime])

  if (!recipes) return <Loading />

  const vetoedBy = (recipeId: string) =>
    ratings.filter((r) => r.recipe_id === recipeId && r.vetoed).map((r) => r.user_id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-48" />
        <Select label="Etiqueta" value={tag} onChange={(e) => setTag(e.target.value)} className="max-w-40">
          <option value="">todas</option>
          {ALL_TAGS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select label="Tiempo máx" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="max-w-32">
          <option value="">—</option>
          <option value="15">15 min</option>
          <option value="30">30 min</option>
          <option value="60">60 min</option>
        </Select>
        <span className="ml-auto flex gap-2">
          {spoonacularKey && <Button onClick={() => setShowImport(true)}>Importar</Button>}
          <Link to="/recetas/nueva">
            <Button variant="primary">Nueva receta</Button>
          </Link>
        </span>
      </div>

      <p className="text-xs font-bold uppercase" data-numeric>
        {filtered.length} recetas
      </p>

      {filtered.length === 0 ? (
        <EmptyState>Nada con esos filtros</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const vetoed = vetoedBy(r.id)
            return (
              <li key={r.id}>
                <Link
                  to={`/recetas/${r.id}`}
                  className={`border-brutal shadow-brutal press-brutal flex h-full flex-col gap-2 bg-white p-3 ${vetoed.length ? 'opacity-50' : ''}`}
                >
                  <p className="font-bold uppercase">
                    {r.name}
                    {vetoed.length > 0 && <span className="ml-2 bg-ink px-1 text-paper">VETADA</span>}
                  </p>
                  <p className="text-xs" data-numeric>
                    {r.prep_minutes + r.cook_minutes} min · {r.servings} raciones
                    {r.household_id && ' · del hogar'}
                  </p>
                  <p className="mt-auto flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {showImport && me && partner !== undefined && (
        <SpoonacularImport
          onClose={(imported) => {
            setShowImport(false)
            if (imported) void load()
          }}
        />
      )}
    </div>
  )
}
