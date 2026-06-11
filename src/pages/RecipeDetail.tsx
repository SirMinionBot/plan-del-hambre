import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { macrosPerServing } from '../lib/macros'
import { indexPrices, recipeCost } from '../lib/costs'
import { useAuth } from '../hooks/useAuth'
import { useHousehold, accentText } from '../hooks/useHousehold'
import { Button } from '../components/ui/Button'
import { Loading, Banner } from '../components/ui/Banner'
import { Tag } from '../components/ui/Tag'
import { RecipeImage } from '../components/ui/RecipeImage'
import { RecipeForm } from '../components/RecipeForm'
import type { CurrentPrice, Ingredient, Recipe, RecipeIngredient, RecipeRating, Supermarket } from '../types/db'

function Stars({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <span className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`size-7 border-2 border-ink text-sm font-bold ${value && n <= value ? 'bg-ink text-paper' : 'bg-white'}`}
        >
          {n}
        </button>
      ))}
    </span>
  )
}

export function RecipeDetailPage() {
  const { id } = useParams()
  const isNew = id === 'nueva'
  const navigate = useNavigate()
  const { session } = useAuth()
  const { household, me, partner } = useHousehold()
  const uid = session!.user.id

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<RecipeIngredient[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ratings, setRatings] = useState<RecipeRating[]>([])
  const [prices, setPrices] = useState<CurrentPrice[]>([])
  const [supers, setSupers] = useState<Supermarket[]>([])
  const [editing, setEditing] = useState(isNew)
  const [loading, setLoading] = useState(!isNew)

  // fetch puro (sin tocar estado) + apply en .then: evita setState síncrono en
  // el efecto y el setState tras desmontar
  const fetchAll = useCallback(async () => {
    const [{ data: ing }, { data: prc }, { data: sup }] = await Promise.all([
      supabase.from('ingredients').select('*').order('name'),
      household
        ? supabase.from('current_prices').select('*').eq('household_id', household.id)
        : Promise.resolve({ data: [] as CurrentPrice[] }),
      supabase.from('supermarkets').select('*').order('id'),
    ])
    if (isNew) return { ing, prc, sup, detail: null }
    const [{ data: r }, { data: l }, { data: rat }] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id!).single(),
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', id!),
      supabase.from('recipe_ratings').select('*').eq('recipe_id', id!),
    ])
    return { ing, prc, sup, detail: { r, l, rat } }
  }, [id, isNew, household])

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchAll>>) => {
    setIngredients(d.ing ?? [])
    setPrices(d.prc ?? [])
    setSupers(d.sup ?? [])
    if (!d.detail) return
    setRecipe(d.detail.r)
    setLines(d.detail.l ?? [])
    setRatings(d.detail.rat ?? [])
    setLoading(false)
  }, [])

  const load = useCallback(async () => apply(await fetchAll()), [apply, fetchAll])

  useEffect(() => {
    let cancelled = false
    void fetchAll().then((d) => {
      if (!cancelled) apply(d)
    })
    return () => {
      cancelled = true
    }
  }, [fetchAll, apply])

  async function rate(value: { rating?: number; vetoed?: boolean }) {
    const current = ratings.find((r) => r.user_id === uid)
    await supabase.from('recipe_ratings').upsert({
      user_id: uid,
      recipe_id: id!,
      rating: value.rating ?? current?.rating ?? null,
      vetoed: value.vetoed ?? current?.vetoed ?? false,
    })
    void load()
  }

  /** Editar una receta del catálogo global = copiarla al hogar (fork). */
  async function fork(): Promise<void> {
    const { data: copy, error } = await supabase
      .from('recipes')
      .insert({
        household_id: household!.id,
        created_by: uid,
        name: `${recipe!.name} (nuestra versión)`,
        description: recipe!.description,
        instructions: recipe!.instructions,
        servings: recipe!.servings,
        prep_minutes: recipe!.prep_minutes,
        cook_minutes: recipe!.cook_minutes,
        tags: recipe!.tags,
        season: recipe!.season,
        batch_days: recipe!.batch_days,
        main_ingredient: recipe!.main_ingredient,
      })
      .select('id')
      .single()
    if (error || !copy) return
    if (lines.length) {
      await supabase
        .from('recipe_ingredients')
        .insert(lines.map((l) => ({ ...l, recipe_id: copy.id })))
    }
    navigate(`/recetas/${copy.id}`)
  }

  async function remove() {
    await supabase.from('recipes').delete().eq('id', id!)
    navigate('/recetas')
  }

  if (loading) return <Loading />

  const ingredientsById = new Map(ingredients.map((i) => [i.id, i]))

  if (editing) {
    return (
      <RecipeForm
        recipe={isNew ? null : recipe}
        lines={lines}
        ingredients={ingredients}
        onDone={(savedId) => {
          if (savedId) {
            if (isNew) return navigate(`/recetas/${savedId}`)
            setEditing(false)
            void load()
          } else if (isNew) {
            navigate('/recetas')
          } else {
            setEditing(false)
          }
        }}
      />
    )
  }

  if (!recipe) return <Banner variant="error">Receta no encontrada</Banner>

  const macros = macrosPerServing(recipe, lines, ingredientsById)
  // coste derivado: precios reales de tickets (el súper más barato) con
  // fallback al estimado del catálogo — nunca almacenado, como las macros
  const cost = recipeCost(
    recipe,
    lines,
    ingredientsById,
    indexPrices(prices),
    null,
    supers.map((s) => s.id),
  )
  const isOwn = recipe.household_id !== null
  const myRating = ratings.find((r) => r.user_id === uid)
  const partnerRating = partner ? ratings.find((r) => r.user_id === partner.user_id) : null
  const vetoed = ratings.some((r) => r.vetoed)

  return (
    <div className="flex flex-col gap-4">
      <Link to="/recetas" className="text-xs font-bold uppercase underline">
        ← Recetas
      </Link>

      {vetoed && <Banner variant="error">Vetada — no entra en casa</Banner>}

      <div className="border-brutal shadow-brutal overflow-hidden bg-white p-6">
        <RecipeImage recipe={recipe} className="-mx-6 -mt-6 mb-4 w-[calc(100%+3rem)] sm:aspect-[21/9]" />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-2xl">{recipe.name}</h2>
          <div className="flex gap-2">
            {isOwn ? (
              <>
                <Button onClick={() => setEditing(true)}>Editar</Button>
                <Button variant="danger" onClick={remove}>
                  Borrar
                </Button>
              </>
            ) : (
              <Button onClick={fork}>Copiar al hogar</Button>
            )}
          </div>
        </div>
        {recipe.description && <p className="mt-2">{recipe.description}</p>}
        <p className="mt-2 flex flex-wrap gap-1">
          {recipe.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          {recipe.season !== 'todo-el-ano' && <Tag active>{recipe.season}</Tag>}
          {recipe.batch_days > 1 && <Tag active>rinde {recipe.batch_days} días</Tag>}
        </p>

        <table className="mt-4 w-full max-w-sm border-2 border-ink text-sm">
          <tbody>
            <tr className="border-2 border-ink">
              <th className="p-1 text-left uppercase">kcal/ración</th>
              <td className="p-1 text-right font-bold">{macros.calories}</td>
            </tr>
            <tr className="border-2 border-ink">
              <th className="p-1 text-left uppercase">P / C / G</th>
              <td className="p-1 text-right font-bold">
                {macros.protein_g} / {macros.carbs_g} / {macros.fat_g} g
              </td>
            </tr>
            <tr className="border-2 border-ink">
              <th className="p-1 text-left uppercase">Tiempo</th>
              <td className="p-1 text-right font-bold">{recipe.prep_minutes + recipe.cook_minutes} min</td>
            </tr>
            {cost != null && (
              <tr className="border-2 border-ink">
                <th className="p-1 text-left uppercase">
                  {cost.realCovered > 0 ? 'Coste (tus tickets)' : 'Coste aprox.'}
                </th>
                <td className="p-1 text-right font-bold" data-numeric>
                  {cost.total.toFixed(2)} €
                  {cost.covered < cost.lines && (
                    <span className="ml-1 text-xs font-normal opacity-60">
                      ({cost.covered}/{cost.lines} ingr.)
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="border-brutal shadow-brutal bg-white p-6">
          <h3>Ingredientes ({recipe.servings} raciones)</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {lines.map((l) => {
              const ing = ingredientsById.get(l.ingredient_id)
              return (
                <li key={l.ingredient_id} className="flex justify-between border-b-2 border-ink/20">
                  <span>{ing?.name}</span>
                  <span className="font-bold" data-numeric>
                    {l.quantity} {l.unit}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="border-brutal shadow-brutal bg-white p-6">
          <h3>Preparación</h3>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
            {(recipe.instructions ?? '').split('\n').filter(Boolean).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      </div>

      <section className="border-brutal shadow-brutal flex flex-col gap-3 bg-white p-6">
        <h3>¿Os gusta?</h3>
        <div className="flex items-center gap-3">
          {me && <span className={`w-24 text-xs font-bold uppercase ${accentText[me.accent]}`}>{me.profile.display_name}</span>}
          <Stars value={myRating?.rating ?? null} onChange={(rating) => void rate({ rating })} />
          <Button variant={myRating?.vetoed ? 'danger' : 'default'} onClick={() => void rate({ vetoed: !myRating?.vetoed })}>
            {myRating?.vetoed ? 'Vetada' : 'Vetar'}
          </Button>
        </div>
        {partner && (
          <div className="flex items-center gap-3">
            <span className={`w-24 text-xs font-bold uppercase ${accentText[partner.accent]}`}>
              {partner.profile.display_name}
            </span>
            <Stars value={partnerRating?.rating ?? null} />
            {partnerRating?.vetoed && <Tag active>veto</Tag>}
          </div>
        )}
      </section>
    </div>
  )
}
