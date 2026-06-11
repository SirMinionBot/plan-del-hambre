import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mondayOf, toISODate, addDays, dayLabel, currentSeason } from '../lib/dates'
import { macrosPerServing, estimatedCost } from '../lib/macros'
import { compareSupermarkets, indexPrices, weekCost } from '../lib/costs'
import {
  planWeek,
  rankForSlot,
  type PlannedSlot,
  type PlannerContext,
} from '../lib/recommender'
import { useHousehold } from '../hooks/useHousehold'
import { useWeekData } from '../hooks/useWeekData'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Field'
import { Banner, Loading } from '../components/ui/Banner'
import type {
  Ingredient,
  MealSlot,
  PantryItem,
  Recipe,
  RecipeIngredient,
  RecipeRating,
  UserExcludedIngredient,
  WeekTemplate,
  WeekTemplateSlot,
} from '../types/db'

interface PlannerData {
  recipes: Recipe[]
  lines: RecipeIngredient[]
  ingredients: Ingredient[]
  ratings: RecipeRating[]
  exclusions: UserExcludedIngredient[]
  pantry: PantryItem[]
  templates: WeekTemplate[]
  templateSlots: WeekTemplateSlot[]
  history: { date: string; recipe_id: string }[]
}

export function PlannerPage() {
  const navigate = useNavigate()
  const { household, me, partner } = useHousehold()
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const week = useWeekData(monday)
  const [data, setData] = useState<PlannerData | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [slotsToPlan, setSlotsToPlan] = useState<MealSlot[]>(['comida', 'cena'])
  const [budgetMode, setBudgetMode] = useState(false)
  const [proposal, setProposal] = useState<PlannedSlot[] | null>(null)
  const [openBreakdown, setOpenBreakdown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const weekStart = toISODate(monday)

  useEffect(() => {
    if (!household) return
    const historyFrom = addDays(weekStart, -10)
    Promise.all([
      supabase.from('recipes').select('*'),
      supabase.from('recipe_ingredients').select('*'),
      supabase.from('ingredients').select('*'),
      supabase.from('recipe_ratings').select('*'),
      supabase.from('user_excluded_ingredients').select('*'),
      supabase.from('pantry_items').select('*').eq('household_id', household.id),
      supabase.from('week_templates').select('*'),
      supabase.from('week_template_slots').select('*'),
      supabase
        .from('meal_entries')
        .select('date, recipe_id')
        .eq('household_id', household.id)
        .gte('date', historyFrom)
        .lt('date', weekStart)
        .not('recipe_id', 'is', null),
    ]).then((results) => {
      const [recipes, lines, ingredients, ratings, exclusions, pantry, templates, templateSlots, history] =
        results.map((r) => r.data ?? [])
      setData({
        recipes,
        lines,
        ingredients,
        ratings,
        exclusions,
        pantry,
        templates,
        templateSlots,
        history,
      } as PlannerData)
    })
  }, [household, weekStart])

  const ctx: PlannerContext | null = useMemo(() => {
    if (!data || !me) return null
    const ingredientsById = new Map(data.ingredients.map((i) => [i.id, i]))
    const linesByRecipe = new Map<string, RecipeIngredient[]>()
    for (const l of data.lines) {
      const arr = linesByRecipe.get(l.recipe_id) ?? []
      arr.push(l)
      linesByRecipe.set(l.recipe_id, arr)
    }
    const macrosByRecipe = new Map(
      data.recipes.map((r) => [r.id, macrosPerServing(r, linesByRecipe.get(r.id) ?? [], ingredientsById)]),
    )
    const recipesById = new Map(data.recipes.map((r) => [r.id, r]))
    const members: [string, string] = [me.user_id, partner?.user_id ?? me.user_id]
    // kcal ya planificadas esta semana por persona (entradas existentes)
    const plannedCaloriesByUser: Record<string, number> = {}
    for (const m of members) {
      plannedCaloriesByUser[m] = week.entries.reduce((acc, e) => {
        const recipeId = e.recipe_id
        if (!recipeId) return acc
        return acc + (macrosByRecipe.get(recipeId)?.calories ?? 0)
      }, 0)
    }
    const weekIngredientIds = new Set<number>()
    for (const e of week.entries) {
      if (!e.recipe_id) continue
      for (const l of linesByRecipe.get(e.recipe_id) ?? []) weekIngredientIds.add(l.ingredient_id)
    }
    return {
      members,
      ratings: data.ratings,
      exclusions: data.exclusions,
      recipeIngredients: linesByRecipe,
      recentHistory: data.history.map((h) => ({
        date: h.date,
        recipeId: h.recipe_id,
        mainIngredient: recipesById.get(h.recipe_id)?.main_ingredient ?? null,
      })),
      pantry: data.pantry,
      weekIngredientIds,
      season: currentSeason(new Date()),
      calorieGoals: Object.fromEntries(
        [me, partner].filter(Boolean).map((m) => [m!.user_id, m!.profile.daily_calorie_goal]),
      ),
      plannedCaloriesByUser,
      macrosByRecipe,
      budgetMode,
      costByRecipe: new Map(
        data.recipes.map((r) => {
          const total = estimatedCost(linesByRecipe.get(r.id) ?? [], ingredientsById)
          return [r.id, total == null ? Number.NaN : total / Math.max(r.servings, 1)] as const
        }),
      ),
    }
  }, [data, me, partner, week.entries, budgetMode])

  // coste previsto: comidas ya en calendario + propuesta actual, con precios
  // reales (el súper más barato por ingrediente) y comparativa entre cadenas
  const costInfo = useMemo(() => {
    if (!data) return null
    const ingredientsById = new Map(data.ingredients.map((i) => [i.id, i]))
    const linesByRecipe = new Map<string, RecipeIngredient[]>()
    for (const l of data.lines) {
      const arr = linesByRecipe.get(l.recipe_id) ?? []
      arr.push(l)
      linesByRecipe.set(l.recipe_id, arr)
    }
    const recipesById = new Map(data.recipes.map((r) => [r.id, r]))
    const meals: { recipe: Recipe; lines: RecipeIngredient[] }[] = []
    for (const e of week.entries) {
      const r = e.recipe_id ? recipesById.get(e.recipe_id) : null
      if (r && e.entry_type !== 'sobras') meals.push({ recipe: r, lines: linesByRecipe.get(r.id) ?? [] })
    }
    for (const p of proposal ?? []) {
      if (p.entry_type !== 'sobras') meals.push({ recipe: p.recipe, lines: linesByRecipe.get(p.recipe.id) ?? [] })
    }
    if (meals.length === 0) return null
    const idx = indexPrices(week.currentPrices)
    const superIds = week.supermarkets.map((s) => s.id)
    const total = weekCost(meals, ingredientsById, idx, null, superIds)
    const bySuper = compareSupermarkets(meals, ingredientsById, idx, superIds).map((c) => ({
      ...c,
      name: week.supermarkets.find((s) => s.id === c.supermarketId)?.name ?? '?',
    }))
    return { total, bySuper }
  }, [data, week.entries, week.currentPrices, week.supermarkets, proposal])

  function generate() {
    if (!ctx || !data) return
    const tplSlots = templateId ? data.templateSlots.filter((s) => s.template_id === templateId) : undefined
    setProposal(
      planWeek({
        weekDates: week.dates,
        slots: slotsToPlan,
        existingEntries: week.entries,
        recipes: data.recipes,
        ctx,
        templateSlots: tplSlots,
      }),
    )
  }

  /** Botón "otra": siguiente mejor candidata para ese slot, sin tocar el resto. */
  function another(slot: PlannedSlot) {
    if (!ctx || !data || !proposal) return
    const usedElsewhere = new Set(
      proposal.filter((p) => !(p.date === slot.date && p.meal_slot === slot.meal_slot)).map((p) => p.recipe.id),
    )
    for (const e of week.entries) if (e.recipe_id) usedElsewhere.add(e.recipe_id)
    const ranked = rankForSlot(
      data.recipes.filter((r) => !usedElsewhere.has(r.id)),
      { date: slot.date, meal_slot: slot.meal_slot, isWeekend: ['sábado', 'domingo'].includes(dayLabel(slot.date).toLowerCase()) || [0, 6].includes(new Date(slot.date + 'T00:00:00').getDay()) },
      ctx,
    )
    const idx = ranked.findIndex((c) => c.recipe.id === slot.recipe.id)
    const next = ranked[(idx + 1) % ranked.length]
    if (!next) return
    setProposal(
      proposal.map((p) =>
        p.date === slot.date && p.meal_slot === slot.meal_slot
          ? { ...p, recipe: next.recipe, breakdown: next.breakdown }
          : p,
      ),
    )
  }

  async function apply() {
    if (!proposal || !household) return
    setBusy(true)
    for (const p of proposal) {
      const { data: entry } = await supabase
        .from('meal_entries')
        .insert({
          household_id: household.id,
          date: p.date,
          meal_slot: p.meal_slot,
          entry_type: p.entry_type,
          recipe_id: p.recipe.id,
        })
        .select('id')
        .single()
      if (entry) {
        await supabase.from('meal_entry_portions').insert(
          [me, partner].filter(Boolean).map((m) => ({ entry_id: entry.id, user_id: m!.user_id, servings: 1 })),
        )
      }
    }
    navigate('/')
  }

  if (week.loading || !data || !ctx) return <Loading />

  const pinnedCount = week.entries.filter((e) => e.pinned).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2>Planificar semana</h2>
        <span className="font-bold uppercase" data-numeric>
          {weekStart}
        </span>
        <Button onClick={() => setMonday(new Date(monday.getTime() + 7 * 86400000))}>semana siguiente →</Button>
        <Link to="/" className="text-xs font-bold uppercase underline">
          volver al calendario
        </Link>
      </div>

      <div className="border-brutal shadow-brutal flex flex-wrap items-end gap-4 bg-white p-4">
        <Select label="Plantilla" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="max-w-56">
          <option value="">— sin plantilla —</option>
          {data.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.household_id ? ' (vuestra)' : ''}
            </option>
          ))}
        </Select>
        <fieldset className="flex gap-2">
          {(['desayuno', 'comida', 'cena'] as MealSlot[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                setSlotsToPlan(slotsToPlan.includes(s) ? slotsToPlan.filter((x) => x !== s) : [...slotsToPlan, s])
              }
              className={`border-2 border-ink px-2 py-1 text-xs font-bold uppercase ${slotsToPlan.includes(s) ? 'bg-ink text-paper' : 'bg-white'}`}
            >
              {s}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={() => setBudgetMode(!budgetMode)}
          className={`border-2 border-ink px-2 py-1 text-xs font-bold uppercase ${budgetMode ? 'bg-ink text-paper' : 'bg-white'}`}
          title="Prioriza recetas baratas (batch, legumbres...)"
        >
          € Semana barata
        </button>
        <Button variant="primary" onClick={generate}>
          Proponer semana
        </Button>
      </div>

      {pinnedCount > 0 && <Banner variant="warn">{pinnedCount} peticiones ancladas — se respetan</Banner>}

      {costInfo && costInfo.total.coveredMeals > 0 && (
        <div className="border-brutal shadow-brutal-sm flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-white p-3 text-sm">
          <span>
            <span className="text-xs font-bold uppercase opacity-60">Coste previsto </span>
            <span className="font-bold" data-numeric>
              {costInfo.total.total.toFixed(2)} €
            </span>
            {costInfo.total.coveredMeals < costInfo.total.meals && (
              <span className="text-xs opacity-60" data-numeric>
                {' '}
                ({costInfo.total.coveredMeals}/{costInfo.total.meals} comidas)
              </span>
            )}
            {household?.weekly_budget != null && (
              <span
                className={`ml-1 text-xs font-bold uppercase ${costInfo.total.total > household.weekly_budget ? 'text-person-a' : 'text-person-b'}`}
                data-numeric
              >
                / {household.weekly_budget} € presupuesto
              </span>
            )}
          </span>
          {costInfo.bySuper.length > 1 && (
            <span className="text-xs opacity-70" data-numeric>
              {costInfo.bySuper.map((s, i) => `${i === 0 ? '🏆 ' : ''}${s.name} ${s.total.toFixed(2)} €`).join(' · ')}
            </span>
          )}
        </div>
      )}

      {proposal && proposal.length === 0 && <Banner variant="ok">Semana completa — nada que rellenar</Banner>}

      {proposal && proposal.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {proposal.map((p) => {
              const key = `${p.date}|${p.meal_slot}`
              const kcal = ctx.macrosByRecipe.get(p.recipe.id)?.calories
              return (
                <li key={key} className="border-brutal shadow-brutal-sm bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-20 text-xs font-bold uppercase" data-numeric>
                      {dayLabel(p.date)}
                    </span>
                    <span className="w-20 text-xs font-bold uppercase">{p.meal_slot}</span>
                    {p.entry_type === 'sobras' ? (
                      <span className="bg-warn px-1 font-bold uppercase">sobras de {p.recipe.name}</span>
                    ) : (
                      <Link to={`/recetas/${p.recipe.id}`} className="font-bold underline">
                        {p.recipe.name}
                      </Link>
                    )}
                    <span className="text-xs" data-numeric>
                      {kcal} kcal/ración
                    </span>
                    <span className="ml-auto flex gap-2">
                      <Button onClick={() => setOpenBreakdown(openBreakdown === key ? null : key)}>¿por qué?</Button>
                      {p.entry_type === 'normal' && <Button onClick={() => another(p)}>otra</Button>}
                    </span>
                  </div>
                  {openBreakdown === key && (
                    <ul className="mt-2 border-t-2 border-ink pt-2 text-xs" data-numeric>
                      {p.breakdown.map((c) => (
                        <li key={c.key}>{c.label}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          <Button variant="primary" onClick={apply} disabled={busy}>
            {busy ? 'Aplicando...' : 'Aplicar al calendario'}
          </Button>
        </>
      )}
    </div>
  )
}
