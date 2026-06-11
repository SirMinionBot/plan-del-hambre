// Composición del digest semanal: menú por día, coste previsto (precios
// vigentes de current_prices con fallback al estimado del catálogo),
// descongelados del primer día y estado de la lista de la compra.
// Lo usan send-push (domingo, semana entrante) y telegram-bot (/semana).

// El cliente llega de send-push o telegram-bot (createClient de npm:); aquí
// se acepta laxo para no acoplar la firma a la versión del SDK.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

export interface Digest {
  weekStart: string
  planned: number // entradas de comida/cena de la semana
  menu: string[] // 7 líneas "lun: comida / cena"
  costText: string | null // "~42,10 € (12/14 con precio)"
  defrost: string[] // ingredientes congelados que pide el primer día
  shoppingPending: boolean // la lista de esa semana no existe aún
}

const DAY_LABELS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface EntryRow {
  date: string
  meal_slot: string
  entry_type: string
  recipe_id: string | null
  recipes: { name: string; servings: number } | { name: string; servings: number }[] | null
}

function recipeOf(e: EntryRow): { name: string; servings: number } | null {
  if (!e.recipes) return null
  return Array.isArray(e.recipes) ? (e.recipes[0] ?? null) : e.recipes
}

function entryLabel(e: EntryRow): string {
  const r = recipeOf(e)
  if (e.entry_type !== 'normal' && e.entry_type !== 'sobras') return e.entry_type
  const name = r?.name ?? '—'
  return e.entry_type === 'sobras' ? `sobras: ${name}` : name
}

/** Versión mínima del cálculo de coste de src/lib/costs.ts (ver design D6). */
function recipeCostEur(
  lines: { ingredient_id: number; quantity: number; unit: string }[],
  ingredients: Map<number, { grams_per_unit: number | null; default_unit: string; estimated_price_per_100g: number | null }>,
  cheapest: Map<number, { price: number; quantity: number | null; unit: string | null }>,
): number | null {
  let total = 0
  let any = false
  for (const l of lines) {
    const ing = ingredients.get(l.ingredient_id)
    if (!ing) continue
    const grams = l.unit === 'g' || l.unit === 'ml' ? l.quantity : l.quantity * (ing.grams_per_unit ?? 0)
    const obs = cheapest.get(l.ingredient_id)
    if (obs) {
      let perGram: number | null = null
      if (obs.unit === 'kg' && obs.quantity) perGram = obs.price / (obs.quantity * 1000)
      else if (obs.unit === 'ud' && obs.quantity && ing.grams_per_unit) perGram = obs.price / (obs.quantity * ing.grams_per_unit)
      else if (obs.quantity == null && ing.default_unit === 'pieza' && ing.grams_per_unit) perGram = obs.price / ing.grams_per_unit
      if (perGram !== null) {
        total += grams * perGram
        any = true
        continue
      }
      if (l.unit === 'pieza' && (obs.unit === 'ud' || obs.quantity == null)) {
        total += l.quantity * (obs.price / (obs.quantity ?? 1))
        any = true
        continue
      }
    }
    if (ing.estimated_price_per_100g != null) {
      total += (grams / 100) * ing.estimated_price_per_100g
      any = true
    }
  }
  return any ? total : null
}

export async function composeDigest(
  supabase: Supa,
  householdId: string,
  mondayIso: string,
  defrostDateIso: string,
): Promise<Digest> {
  const sunday = addDays(mondayIso, 6)
  const { data: entries } = await supabase
    .from('meal_entries')
    .select('date, meal_slot, entry_type, recipe_id, recipes(name, servings)')
    .eq('household_id', householdId)
    .gte('date', mondayIso)
    .lte('date', sunday)
    .in('meal_slot', ['comida', 'cena'])
  const rows: EntryRow[] = entries ?? []

  const menu: string[] = []
  for (let i = 0; i < 7; i++) {
    const dayIso = addDays(mondayIso, i)
    const ofDay = rows.filter((e) => e.date === dayIso)
    const slot = (s: string) => {
      const e = ofDay.find((x) => x.meal_slot === s)
      return e ? entryLabel(e) : '—'
    }
    menu.push(`${DAY_LABELS[i]}: ${slot('comida')} / ${slot('cena')}`)
  }

  // coste previsto: solo comidas normales con receta (las sobras no se compran)
  const costable = rows.filter((e) => e.entry_type === 'normal' && e.recipe_id)
  const recipeIds = [...new Set(costable.map((e) => e.recipe_id as string))]
  let costText: string | null = null
  if (recipeIds.length) {
    const [{ data: rlines }, { data: prices }, { data: ings }] = await Promise.all([
      supabase.from('recipe_ingredients').select('recipe_id, ingredient_id, quantity, unit').in('recipe_id', recipeIds),
      supabase.from('current_prices').select('ingredient_id, price, quantity, unit').eq('household_id', householdId),
      supabase.from('ingredients').select('id, grams_per_unit, default_unit, estimated_price_per_100g'),
    ])
    const ingredients = new Map(
      (
        (ings ?? []) as {
          id: number
          grams_per_unit: number | null
          default_unit: string
          estimated_price_per_100g: number | null
        }[]
      ).map((i) => [i.id, i]),
    )
    // la observación más barata por ingrediente entre súpers
    const cheapest = new Map<number, { price: number; quantity: number | null; unit: string | null }>()
    for (const p of prices ?? []) {
      const prev = cheapest.get(p.ingredient_id)
      if (!prev || p.price < prev.price) cheapest.set(p.ingredient_id, p)
    }
    const byRecipe = new Map<string, { ingredient_id: number; quantity: number; unit: string }[]>()
    for (const l of rlines ?? []) {
      const arr = byRecipe.get(l.recipe_id) ?? []
      arr.push(l)
      byRecipe.set(l.recipe_id, arr)
    }
    let total = 0
    let covered = 0
    for (const e of costable) {
      const c = recipeCostEur(byRecipe.get(e.recipe_id as string) ?? [], ingredients, cheapest)
      if (c === null) continue
      total += c
      covered++
    }
    if (covered > 0) {
      costText = `~${total.toFixed(2)} € (${covered}/${costable.length} con precio)`
    }
  }

  // descongelar para el primer día
  const firstDay = rows.filter((e) => e.date === defrostDateIso && e.entry_type === 'normal' && e.recipe_id)
  const defrost: string[] = []
  for (const e of firstDay) {
    const { data: frozen } = await supabase
      .from('recipe_ingredients')
      .select('ingredients!inner(name, typically_frozen)')
      .eq('recipe_id', e.recipe_id)
      .eq('ingredients.typically_frozen', true)
    for (const f of frozen ?? []) {
      const name = Array.isArray(f.ingredients) ? f.ingredients[0]?.name : f.ingredients.name
      if (name && !defrost.includes(name)) defrost.push(name)
    }
  }

  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('household_id', householdId)
    .eq('week_start', mondayIso)
    .maybeSingle()

  return { weekStart: mondayIso, planned: rows.length, menu, costText, defrost, shoppingPending: !list }
}

/** Mensaje completo para Telegram (HTML, como el resto del bot). */
export function digestTelegram(d: Digest, title = 'LA SEMANA QUE VIENE'): string {
  const parts = [`<b>${title} · ${d.weekStart}</b>`, '', ...d.menu.map(esc)]
  const extras: string[] = []
  if (d.costText) extras.push(`💶 Coste previsto: ${esc(d.costText)}`)
  if (d.defrost.length) extras.push(`🧊 Saca del congelador: ${esc(d.defrost.join(', '))}`)
  if (d.shoppingPending) extras.push('🛒 La lista de la compra está sin generar')
  if (extras.length) parts.push('', ...extras)
  return parts.join('\n')
}

/** Cuerpo corto para el push (el detalle vive en la app/Telegram). */
export function digestPushBody(d: Digest): string {
  const bits = [`${d.planned} comidas planificadas`]
  if (d.costText) bits.push(d.costText)
  if (d.defrost.length) bits.push(`saca ${d.defrost.join(', ')}`)
  if (d.shoppingPending) bits.push('compra sin generar')
  return bits.join(' · ')
}
