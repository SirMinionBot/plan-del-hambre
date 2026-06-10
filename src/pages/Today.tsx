import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mondayOf, toISODate } from '../lib/dates'
import { macrosPerServing } from '../lib/macros'
import { useAuth } from '../hooks/useAuth'
import { useHousehold, accentBg, accentText } from '../hooks/useHousehold'
import { useWeekData } from '../hooks/useWeekData'
import { Button } from '../components/ui/Button'
import { Banner, Loading } from '../components/ui/Banner'
import { QuickRating } from '../components/QuickRating'
import type { MealEntry, MealSlot } from '../types/db'

const SLOTS: MealSlot[] = ['desayuno', 'comida', 'cena']

export function TodayPage() {
  const { session } = useAuth()
  const { me, partner } = useHousehold()
  const [monday] = useState(() => mondayOf(new Date()))
  const week = useWeekData(monday)
  const today = toISODate(new Date())
  const [rating, setRating] = useState<{ id: string; name: string } | null>(null)
  const [myRatingsCount, setMyRatingsCount] = useState<number | null>(null)

  const members = [me, partner].filter(Boolean)

  useEffect(() => {
    if (!session) return
    supabase
      .from('recipe_ratings')
      .select('recipe_id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .then(({ count }) => setMyRatingsCount(count ?? 0))
  }, [session])

  async function markCooked(entry: MealEntry) {
    const marking = !entry.cooked_at
    await supabase
      .from('meal_entries')
      .update({ cooked_at: marking ? new Date().toISOString() : null })
      .eq('id', entry.id)
    await week.reload()
    if (marking && entry.recipe_id) {
      const recipe = week.recipesById.get(entry.recipe_id)
      if (recipe) setRating({ id: recipe.id, name: recipe.name })
    }
  }

  if (week.loading) return <Loading />

  const todayEntries = week.entries.filter((e) => e.date === today)
  const weekEmpty = week.entries.length === 0

  const memberKcal = (userId: string) => {
    let kcal = 0
    for (const e of todayEntries) {
      const p = week.portions.find((p) => p.entry_id === e.id && p.user_id === userId)
      const recipeId = p?.recipe_id ?? e.recipe_id
      if (!recipeId || !p) continue
      const r = week.recipesById.get(recipeId)
      if (!r) continue
      kcal += macrosPerServing(r, week.recipeIngredients.get(recipeId) ?? [], week.ingredientsById).calories * p.servings
    }
    return Math.round(kcal)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        <Link to="/calendario" className="text-xs font-bold uppercase underline">
          Ver semana →
        </Link>
      </div>

      {myRatingsCount !== null && myRatingsCount < 10 && (
        <Link to="/calibrar" className="block">
          <Banner variant="warn">El recomendador aún no te conoce — calibra tus gustos (2 min) →</Banner>
        </Link>
      )}

      {weekEmpty ? (
        <div className="border-brutal shadow-brutal flex flex-col items-center gap-4 bg-white p-8 text-center">
          <p className="font-bold uppercase">Semana sin planificar</p>
          <Link to="/planificar">
            <Button variant="primary">Planificar semana</Button>
          </Link>
        </div>
      ) : (
        SLOTS.map((slot) => {
          const entry = todayEntries.find((e) => e.meal_slot === slot)
          return <SlotCard key={slot} slot={slot} entry={entry ?? null} week={week} onCooked={markCooked} />
        })
      )}

      {members.length > 0 && (
        <div className="border-brutal flex items-center justify-around bg-white p-3" data-numeric>
          {members.map((m) => (
            <span key={m!.user_id} className={`font-bold ${accentText[m!.accent]}`}>
              {m!.profile.display_name}: {memberKcal(m!.user_id)} / {m!.profile.daily_calorie_goal} kcal
            </span>
          ))}
        </div>
      )}

      {rating && <QuickRating recipeId={rating.id} recipeName={rating.name} onClose={() => setRating(null)} />}
    </div>
  )
}

function SlotCard({
  slot,
  entry,
  week,
  onCooked,
}: {
  slot: MealSlot
  entry: MealEntry | null
  week: ReturnType<typeof useWeekData>
  onCooked: (e: MealEntry) => void
}) {
  const { me, partner } = useHousehold()
  const members = [me, partner].filter(Boolean)
  const recipe = entry?.recipe_id ? week.recipesById.get(entry.recipe_id) : null
  const cook = members.find((m) => m?.user_id === entry?.cook_user_id)

  return (
    <section className="border-brutal shadow-brutal bg-white">
      <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-3 py-1 text-paper">
        <h3 className="text-sm">{slot}</h3>
        {cook && (
          <span className="flex items-center gap-1 text-xs font-bold uppercase">
            cocina {cook.profile.display_name}
            <span className={`size-3 border-2 border-paper ${accentBg[cook.accent]}`} />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        {!entry ? (
          <p className="text-sm font-bold uppercase opacity-40">— nada planificado —</p>
        ) : entry.entry_type === 'fuera' || entry.entry_type === 'cheat' || entry.entry_type === 'evento' ? (
          <p className="bg-ink px-2 py-1 text-center font-bold uppercase text-paper">{entry.entry_type}</p>
        ) : (
          <>
            <p className="text-lg font-bold">
              {entry.entry_type === 'sobras' && <span className="mr-1 bg-warn px-1 text-sm uppercase">sobras</span>}
              {recipe ? (
                <Link to={`/recetas/${recipe.id}`} className="underline">
                  {recipe.name}
                </Link>
              ) : (
                '—'
              )}
            </p>
            {members.map((m) => {
              const p = week.portions.find((x) => x.entry_id === entry.id && x.user_id === m!.user_id)
              const override = p?.recipe_id ? week.recipesById.get(p.recipe_id) : null
              if (!p) return null
              return (
                <p key={m!.user_id} className="flex items-center gap-2 text-sm" data-numeric>
                  <span className={`size-3 border-2 border-ink ${accentBg[m!.accent]}`} />
                  {p.servings} ración{p.servings === 1 ? '' : 'es'}
                  {override && <span className="font-bold">→ {override.name}</span>}
                </p>
              )
            })}
            <Button
              variant={entry.cooked_at ? 'default' : 'primary'}
              onClick={() => onCooked(entry)}
              className="mt-1"
            >
              {entry.cooked_at ? '✓ Cocinada (deshacer)' : '✓ Marcar cocinada'}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
