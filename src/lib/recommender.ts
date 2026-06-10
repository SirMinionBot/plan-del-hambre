// Recomendador heurístico de menús semanales. Funciones puras: sin red,
// sin Supabase, sin Math.random ni Date.now (la fecha/temporada llegan por ctx).

import type {
  MacrosPerServing,
  MealEntry,
  MealSlot,
  PantryItem,
  Recipe,
  RecipeIngredient,
  RecipeRating,
  SeasonTag,
  UserExcludedIngredient,
  WeekTemplateSlot,
} from '../types/db'

/** Pesos de cada componente del scoring. Ajustables sin tocar la lógica. */
export const WEIGHTS = {
  /** Puntos por nivel de rating mínimo respecto al neutro (3). */
  gustoMin: 10,
  /** Penalización por receta repetida en 10 días (mitad si solo repite main_ingredient). */
  variedad: 20,
  /** Bonus por temporada coincidente (penalización simétrica si no coincide). */
  temporada: 8,
  /** Bonus/penalización máxima por ajuste calórico al objetivo restante. */
  macros: 10,
  /** Bonus por cada ingrediente ya presente en la compra de la semana. */
  solapamientoCompra: 3,
  /** Bonus/penalización por encaje con el contexto del slot (rápida vs elaborada). */
  contextoSlot: 12,
  /** Bonus por cada ítem de despensa a punto de caducar que la receta aprovecha. */
  caducidad: 15,
  /** Modo semana barata: puntos por cada € por ración por debajo/encima de la referencia. */
  coste: 8,
}

/** € por ración de referencia para el componente de coste (modo semana barata). */
const COSTE_REFERENCIA = 2.5

export interface ScoreComponent {
  key: string
  label: string
  points: number
}

export interface ScoredCandidate {
  recipe: Recipe
  score: number
  breakdown: ScoreComponent[]
}

export interface PlannerContext {
  members: [string, string]
  ratings: RecipeRating[]
  exclusions: UserExcludedIngredient[]
  recipeIngredients: Map<string, RecipeIngredient[]>
  recentHistory: { date: string; recipeId: string; mainIngredient: string | null }[]
  pantry: PantryItem[]
  weekIngredientIds: Set<number>
  season: SeasonTag
  calorieGoals: Record<string, number>
  plannedCaloriesByUser: Record<string, number>
  macrosByRecipe: Map<string, MacrosPerServing>
  /** Modo semana barata: activa el componente de coste. */
  budgetMode?: boolean
  /** € por ración por receta (estimado de ingredientes); requerido si budgetMode. */
  costByRecipe?: Map<string, number>
}

export interface SlotInfo {
  date: string
  meal_slot: MealSlot
  isWeekend: boolean
}

export interface PlannedSlot {
  date: string
  meal_slot: MealSlot
  recipe: Recipe
  breakdown: ScoreComponent[]
  entry_type: 'normal' | 'sobras'
}

const DAY_MS = 86_400_000
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Días de a hasta b (positivo si b es posterior). Fechas YYYY-MM-DD, cálculo en UTC. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS)
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0 = lunes ... 6 = domingo (convención de WeekTemplateSlot). */
function weekdayIndex(date: string): number {
  return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
}

function weekdayName(date: string): string {
  return WEEKDAYS[weekdayIndex(date)]
}

function fmt(points: number): string {
  return points < 0 ? `−${Math.abs(points)}` : `+${points}`
}

function component(key: string, label: string, points: number): ScoreComponent {
  return { key, label: `${label}: ${fmt(points)}`, points }
}

/**
 * Filtro duro previo al scoring: fuera toda receta vetada por cualquier miembro
 * o que contenga un ingrediente excluido por cualquier miembro.
 */
export function filterCandidates(recipes: Recipe[], ctx: PlannerContext): Recipe[] {
  const memberSet = new Set<string>(ctx.members)
  const vetoed = new Set(
    ctx.ratings.filter((r) => r.vetoed && memberSet.has(r.user_id)).map((r) => r.recipe_id),
  )
  const excludedIngredients = new Set(
    ctx.exclusions.filter((e) => memberSet.has(e.user_id)).map((e) => e.ingredient_id),
  )
  return recipes.filter((recipe) => {
    if (vetoed.has(recipe.id)) return false
    const ingredients = ctx.recipeIngredients.get(recipe.id) ?? []
    return !ingredients.some((i) => excludedIngredients.has(i.ingredient_id))
  })
}

/** Slot desayuno exige tag "desayuno"; comida/cena excluyen recetas de desayuno. */
function matchesMealSlot(recipe: Recipe, meal: MealSlot): boolean {
  const isBreakfastRecipe = recipe.tags.includes('desayuno')
  return meal === 'desayuno' ? isBreakfastRecipe : !isBreakfastRecipe
}

function gustoComponent(recipe: Recipe, ctx: PlannerContext): ScoreComponent {
  // El menos entusiasta manda: se puntúa el rating mínimo; sin rating = 3 neutro.
  const ratings = ctx.members.map((member) => {
    const r = ctx.ratings.find((x) => x.user_id === member && x.recipe_id === recipe.id)
    return r?.rating ?? 3
  })
  const min = Math.min(...ratings)
  const points = (min - 3) * WEIGHTS.gustoMin
  return component('gusto', `gusto mínimo entre ambos ${min}/5`, points)
}

function variedadComponent(recipe: Recipe, slot: SlotInfo, ctx: PlannerContext): ScoreComponent {
  const recent = ctx.recentHistory.filter((h) => {
    const diff = daysBetween(h.date, slot.date)
    return diff >= 0 && diff <= 10
  })
  const sameRecipe = recent.find((h) => h.recipeId === recipe.id)
  if (sameRecipe) {
    return component(
      'variedad',
      `repite ${recipe.name} del ${weekdayName(sameRecipe.date)}`,
      -WEIGHTS.variedad,
    )
  }
  const sameMain =
    recipe.main_ingredient !== null
      ? recent.find((h) => h.mainIngredient === recipe.main_ingredient)
      : undefined
  if (sameMain) {
    // Repetir solo el ingrediente principal penaliza la mitad que repetir la receta.
    return component(
      'variedad',
      `repite ${recipe.main_ingredient} del ${weekdayName(sameMain.date)}`,
      -Math.round(WEIGHTS.variedad / 2),
    )
  }
  return component('variedad', 'sin repeticiones recientes', 0)
}

function temporadaComponent(recipe: Recipe, ctx: PlannerContext): ScoreComponent {
  if (recipe.season === 'todo-el-ano') {
    return component('temporada', 'receta de todo el año', 0)
  }
  if (recipe.season === ctx.season) {
    return component('temporada', `de temporada (${ctx.season})`, WEIGHTS.temporada)
  }
  return component('temporada', `fuera de temporada (${recipe.season})`, -WEIGHTS.temporada)
}

function macrosComponent(recipe: Recipe, ctx: PlannerContext): ScoreComponent {
  const macros = ctx.macrosByRecipe.get(recipe.id)
  if (!macros) return component('macros', 'sin datos de macros', 0)
  const scores: number[] = []
  for (const member of ctx.members) {
    const goal = ctx.calorieGoals[member]
    if (goal === undefined) continue
    const remaining = goal - (ctx.plannedCaloriesByUser[member] ?? 0)
    if (remaining <= 0) {
      scores.push(-1) // ya no le quedan calorías: cualquier ración rebasa.
      continue
    }
    const over = macros.calories - remaining
    if (over <= 0) {
      scores.push(macros.calories / remaining) // cuanto más acerque al objetivo, mejor.
    } else if (over > remaining * 0.25) {
      scores.push(-1) // lo rebasa mucho.
    } else {
      scores.push(0)
    }
  }
  if (scores.length === 0) return component('macros', 'sin objetivos calóricos', 0)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const points = Math.round(avg * WEIGHTS.macros)
  const label =
    points >= 0 ? 'encaja con las calorías restantes' : 'rebasa las calorías restantes'
  return component('macros', label, points)
}

function solapamientoComponent(recipe: Recipe, ctx: PlannerContext): ScoreComponent {
  const ingredients = ctx.recipeIngredients.get(recipe.id) ?? []
  const shared = ingredients.filter((i) => ctx.weekIngredientIds.has(i.ingredient_id)).length
  return component(
    'solapamiento',
    `${shared} ingrediente(s) ya en la compra de la semana`,
    shared * WEIGHTS.solapamientoCompra,
  )
}

function contextoComponent(recipe: Recipe, slot: SlotInfo): ScoreComponent {
  const total = recipe.prep_minutes + recipe.cook_minutes
  const rapida = recipe.tags.includes('rapida')
  if (!slot.isWeekend) {
    if (rapida) return component('contexto', 'rápida para entre semana', WEIGHTS.contextoSlot)
    if (total > 45) {
      return component('contexto', `demasiado larga entre semana (${total} min)`, -WEIGHTS.contextoSlot)
    }
    return component('contexto', 'tiempo razonable entre semana', 0)
  }
  // Fin de semana: al revés, premia las elaboradas y penaliza las rápidas.
  if (total > 45) {
    return component('contexto', `elaborada para el fin de semana (${total} min)`, WEIGHTS.contextoSlot)
  }
  if (rapida) return component('contexto', 'rápida en fin de semana', -WEIGHTS.contextoSlot)
  return component('contexto', 'tiempo razonable en fin de semana', 0)
}

function caducidadComponent(recipe: Recipe, slot: SlotInfo, ctx: PlannerContext): ScoreComponent {
  const ingredientIds = new Set(
    (ctx.recipeIngredients.get(recipe.id) ?? []).map((i) => i.ingredient_id),
  )
  // Cuenta ítems de despensa que caducan en <=3 días desde slot.date y la receta
  // usaría antes de su fecha de caducidad.
  const aprovechados = ctx.pantry.filter((item) => {
    if (item.ingredient_id === null || item.expires_on === null) return false
    if (!ingredientIds.has(item.ingredient_id)) return false
    const diff = daysBetween(slot.date, item.expires_on)
    return diff >= 0 && diff <= 3
  })
  return component(
    'caducidad',
    `aprovecha ${aprovechados.length} ítem(s) a punto de caducar`,
    aprovechados.length * WEIGHTS.caducidad,
  )
}

function costeComponent(recipe: Recipe, ctx: PlannerContext): ScoreComponent | null {
  // Solo en modo semana barata y con coste conocido para la receta.
  if (!ctx.budgetMode) return null
  const costePorRacion = ctx.costByRecipe?.get(recipe.id)
  if (costePorRacion == null || !Number.isFinite(costePorRacion)) return null
  const delta = COSTE_REFERENCIA - costePorRacion
  return component(
    'coste',
    `${costePorRacion.toFixed(2)} €/ración (modo barato)`,
    Math.round(delta * WEIGHTS.coste),
  )
}

/** Suma ponderada con desglose explicable de cada componente. */
export function scoreRecipe(
  recipe: Recipe,
  slot: SlotInfo,
  ctx: PlannerContext,
): ScoredCandidate {
  const breakdown: ScoreComponent[] = [
    gustoComponent(recipe, ctx),
    variedadComponent(recipe, slot, ctx),
    temporadaComponent(recipe, ctx),
    macrosComponent(recipe, ctx),
    solapamientoComponent(recipe, ctx),
    contextoComponent(recipe, slot),
    caducidadComponent(recipe, slot, ctx),
    costeComponent(recipe, ctx),
  ].filter((c): c is ScoreComponent => c !== null)
  const score = breakdown.reduce((sum, c) => sum + c.points, 0)
  return { recipe, score, breakdown }
}

/**
 * Filtra, puntúa y ordena descendente. El botón "otra" toma el siguiente
 * elemento del array devuelto. Desempate determinista por nombre e id.
 */
export function rankForSlot(recipes: Recipe[], slot: SlotInfo, ctx: PlannerContext): ScoredCandidate[] {
  const candidates = filterCandidates(recipes, ctx).filter((r) => matchesMealSlot(r, slot.meal_slot))
  return candidates
    .map((r) => scoreRecipe(r, slot, ctx))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.recipe.name.localeCompare(b.recipe.name) ||
        a.recipe.id.localeCompare(b.recipe.id),
    )
}

function matchesTemplate(recipe: Recipe, tpl: WeekTemplateSlot): boolean {
  if (tpl.required_tags.some((t) => !recipe.tags.includes(t))) return false
  if (tpl.excluded_tags.some((t) => recipe.tags.includes(t))) return false
  if (tpl.max_total_minutes !== null && recipe.prep_minutes + recipe.cook_minutes > tpl.max_total_minutes) {
    return false
  }
  return true
}

function isWeekendDate(date: string): boolean {
  return weekdayIndex(date) >= 5
}

/**
 * Rellena solo los slots vacíos de la semana: respeta entradas existentes
 * (ancladas o no), aplica restricciones de plantilla como filtro, coloca
 * `sobras` los días siguientes cuando batch_days > 1, y evita repetir la
 * misma receta dentro de la semana. No muta el ctx recibido.
 */
export function planWeek(args: {
  weekDates: string[]
  slots: MealSlot[]
  existingEntries: MealEntry[]
  recipes: Recipe[]
  ctx: PlannerContext
  templateSlots?: WeekTemplateSlot[]
}): PlannedSlot[] {
  const { weekDates, slots, existingEntries, recipes, ctx, templateSlots } = args
  const occupied = new Set(existingEntries.map((e) => `${e.date}|${e.meal_slot}`))
  const usedRecipeIds = new Set(
    existingEntries.map((e) => e.recipe_id).filter((id): id is string => id !== null),
  )
  // Copias de trabajo para no mutar el contexto del llamante.
  const weekIngredientIds = new Set(ctx.weekIngredientIds)
  const recentHistory = [...ctx.recentHistory]
  const pendingSobras = new Map<string, Recipe>()
  const result: PlannedSlot[] = []

  for (const date of weekDates) {
    const isWeekend = isWeekendDate(date)
    for (const meal of slots) {
      const key = `${date}|${meal}`
      if (occupied.has(key)) continue

      const sobrasDe = pendingSobras.get(key)
      if (sobrasDe) {
        // Hueco reservado por batch cooking: no se vuelve a puntuar.
        result.push({
          date,
          meal_slot: meal,
          recipe: sobrasDe,
          breakdown: [component('sobras', `sobras de ${sobrasDe.name}`, 0)],
          entry_type: 'sobras',
        })
        occupied.add(key)
        continue
      }

      let pool = recipes.filter((r) => !usedRecipeIds.has(r.id))
      const tpl = templateSlots?.find(
        (t) => t.weekday === weekdayIndex(date) && t.meal_slot === meal,
      )
      if (tpl) pool = pool.filter((r) => matchesTemplate(r, tpl))

      const slotCtx: PlannerContext = { ...ctx, weekIngredientIds, recentHistory }
      const best = rankForSlot(pool, { date, meal_slot: meal, isWeekend }, slotCtx)[0]
      if (!best) continue // sin candidatas válidas: el hueco queda vacío.

      result.push({
        date,
        meal_slot: meal,
        recipe: best.recipe,
        breakdown: best.breakdown,
        entry_type: 'normal',
      })
      occupied.add(key)
      usedRecipeIds.add(best.recipe.id)
      for (const ing of ctx.recipeIngredients.get(best.recipe.id) ?? []) {
        weekIngredientIds.add(ing.ingredient_id)
      }
      recentHistory.push({
        date,
        recipeId: best.recipe.id,
        mainIngredient: best.recipe.main_ingredient,
      })

      // batch_days > 1: reserva sobras en el slot equivalente de los días siguientes.
      for (let d = 1; d < best.recipe.batch_days; d++) {
        const nextDate = addDays(date, d)
        const nextKey = `${nextDate}|${meal}`
        if (weekDates.includes(nextDate) && !occupied.has(nextKey)) {
          pendingSobras.set(nextKey, best.recipe)
        }
      }
    }
  }
  return result
}
