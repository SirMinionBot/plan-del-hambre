import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mondayOf, toISODate, addDays, weekDates } from '../lib/dates'
import { macrosPerServing } from '../lib/macros'
import { useHousehold, accentBg } from '../hooks/useHousehold'
import { Loading, EmptyState } from '../components/ui/Banner'
import type { Ingredient, MealEntry, MealEntryPortion, Recipe, RecipeIngredient } from '../types/db'

const WEEKS = 8

interface StatsData {
  entries: MealEntry[]
  portions: MealEntryPortion[]
  recipes: Map<string, Recipe>
  lines: Map<string, RecipeIngredient[]>
  ingredients: Map<number, Ingredient>
}

export function StatsPage() {
  const { household, me, partner } = useHousehold()
  const [data, setData] = useState<StatsData | null>(null)

  const currentMonday = toISODate(mondayOf(new Date()))
  const from = addDays(currentMonday, -7 * (WEEKS - 1))

  useEffect(() => {
    if (!household) return
    void (async () => {
      const { data: entries } = await supabase
        .from('meal_entries')
        .select('*')
        .eq('household_id', household.id)
        .gte('date', from)
      const ids = (entries ?? []).map((e) => e.id)
      const { data: portions } = ids.length
        ? await supabase.from('meal_entry_portions').select('*').in('entry_id', ids)
        : { data: [] }
      const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id).filter(Boolean) as string[])]
      const [{ data: recipes }, { data: lines }, { data: ingredients }] = await Promise.all([
        recipeIds.length ? supabase.from('recipes').select('*').in('id', recipeIds) : Promise.resolve({ data: [] }),
        recipeIds.length
          ? supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds)
          : Promise.resolve({ data: [] }),
        supabase.from('ingredients').select('*'),
      ])
      const linesMap = new Map<string, RecipeIngredient[]>()
      for (const l of lines ?? []) {
        linesMap.set(l.recipe_id, [...(linesMap.get(l.recipe_id) ?? []), l])
      }
      setData({
        entries: entries ?? [],
        portions: portions ?? [],
        recipes: new Map((recipes ?? []).map((r: Recipe) => [r.id, r])),
        lines: linesMap,
        ingredients: new Map((ingredients ?? []).map((i: Ingredient) => [i.id, i])),
      })
    })()
  }, [household, from])

  const weeks = useMemo(() => {
    return Array.from({ length: WEEKS }, (_, i) => {
      const monday = addDays(from, i * 7)
      return { monday, dates: weekDates(new Date(monday + 'T00:00:00')) }
    })
  }, [from])

  const stats = useMemo(() => {
    if (!data || !me) return null
    const members = [me, partner].filter(Boolean)

    // kcal medias diarias por persona y semana (solo días con algo planificado)
    const weekly = weeks.map(({ monday, dates }) => {
      const perUser: Record<string, number> = {}
      for (const m of members) {
        let kcal = 0
        const daysWithFood = new Set<string>()
        for (const e of data.entries.filter((e) => dates.includes(e.date))) {
          const p = data.portions.find((p) => p.entry_id === e.id && p.user_id === m!.user_id)
          const recipeId = p?.recipe_id ?? e.recipe_id
          if (!recipeId || !p) continue
          const r = data.recipes.get(recipeId)
          if (!r) continue
          kcal += macrosPerServing(r, data.lines.get(recipeId) ?? [], data.ingredients).calories * p.servings
          daysWithFood.add(e.date)
        }
        perUser[m!.user_id] = daysWithFood.size ? Math.round(kcal / daysWithFood.size) : 0
      }
      return { monday, perUser }
    })

    // racha: semanas consecutivas (hacia atrás desde la actual) con comida+cena completas
    let streak = 0
    for (let i = weeks.length - 1; i >= 0; i--) {
      const { dates } = weeks[i]
      const filled = data.entries.filter((e) => dates.includes(e.date) && ['comida', 'cena'].includes(e.meal_slot))
      if (filled.length >= 14) streak++
      else break
    }

    // top recetas por veces cocinadas
    const cookedCount = new Map<string, number>()
    for (const e of data.entries) {
      if (!e.cooked_at || !e.recipe_id) continue
      cookedCount.set(e.recipe_id, (cookedCount.get(e.recipe_id) ?? 0) + 1)
    }
    const top = [...cookedCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({ recipe: data.recipes.get(id), count }))

    // comodines de los últimos 30 días
    const cutoff = addDays(toISODate(new Date()), -30)
    const comodines = data.entries.filter(
      (e) => e.date >= cutoff && ['fuera', 'cheat', 'evento'].includes(e.entry_type),
    ).length

    return { weekly, streak, top, comodines, members }
  }, [data, me, partner, weeks])

  if (!data || !stats) return <Loading />

  const maxKcal = Math.max(
    1,
    ...stats.weekly.flatMap((w) => Object.values(w.perUser)),
    ...stats.members.map((m) => m!.profile.daily_calorie_goal),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="border-brutal shadow-brutal bg-white p-4 text-center">
          <p className="text-4xl font-bold" data-numeric>
            {stats.streak}
          </p>
          <p className="text-xs font-bold uppercase">semanas seguidas planificadas</p>
        </div>
        <div className="border-brutal shadow-brutal bg-white p-4 text-center">
          <p className="text-4xl font-bold" data-numeric>
            {stats.comodines}
          </p>
          <p className="text-xs font-bold uppercase">comodines últimos 30 días (fuera/cheat/evento)</p>
        </div>
        <div className="border-brutal shadow-brutal bg-white p-4 text-center">
          <p className="text-4xl font-bold" data-numeric>
            {data.entries.filter((e) => e.cooked_at).length}
          </p>
          <p className="text-xs font-bold uppercase">comidas cocinadas registradas</p>
        </div>
      </div>

      <section className="border-brutal shadow-brutal bg-white p-4">
        <h3>Kcal medias diarias planificadas vs objetivo</h3>
        <div className="mt-3 flex flex-col gap-3">
          {stats.weekly.map(({ monday, perUser }) => (
            <div key={monday} className="flex flex-col gap-1">
              <p className="text-xs font-bold uppercase" data-numeric>
                {monday}
              </p>
              {stats.members.map((m) => {
                const kcal = perUser[m!.user_id]
                const goal = m!.profile.daily_calorie_goal
                const pct = Math.min(100, (kcal / maxKcal) * 100)
                const goalPct = Math.min(100, (goal / maxKcal) * 100)
                return (
                  <div key={m!.user_id} className="relative h-5 border-2 border-ink bg-white">
                    <div className={`h-full ${accentBg[m!.accent]}`} style={{ width: `${pct}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${goalPct}%` }} title={`objetivo ${goal}`} />
                    <span className="absolute right-1 top-0 text-xs font-bold" data-numeric>
                      {kcal || '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs uppercase opacity-60">La raya negra es el objetivo de cada uno. Días fuera/cheat no computan kcal.</p>
      </section>

      <section className="border-brutal shadow-brutal bg-white p-4">
        <h3>Top recetas cocinadas</h3>
        {stats.top.length === 0 ? (
          <EmptyState>Marcad comidas como cocinadas (✓ en el calendario) para alimentar el ranking</EmptyState>
        ) : (
          <ol className="mt-2 flex flex-col gap-1">
            {stats.top.map(({ recipe, count }, i) => (
              <li key={recipe?.id ?? i} className="flex justify-between border-b-2 border-ink/20 py-1 text-sm">
                <span className="font-bold">
                  {i + 1}. {recipe?.name ?? '—'}
                </span>
                <span data-numeric>{count}×</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
