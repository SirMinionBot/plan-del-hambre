// Importador puntual de Spoonacular: busca y convierte UNA receta a formato
// local, guardándola como receta del hogar con tag 'importada'. Sin clave
// (VITE_SPOONACULAR_KEY) la UI no se muestra y este módulo no se invoca.

import { supabase, spoonacularKey } from '../supabase'

const BASE = 'https://api.spoonacular.com'

export interface SpoonacularHit {
  id: number
  title: string
}

interface SpoonacularIngredient {
  name: string
  amount: number
  unit: string
}

interface SpoonacularRecipe {
  title: string
  summary?: string
  servings: number
  readyInMinutes: number
  preparationMinutes?: number
  cookingMinutes?: number
  sourceUrl?: string
  image?: string
  extendedIngredients: SpoonacularIngredient[]
  analyzedInstructions?: { steps: { step: string }[] }[]
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!spoonacularKey) throw new Error('Sin VITE_SPOONACULAR_KEY')
  const qs = new URLSearchParams({ ...params, apiKey: spoonacularKey })
  const res = await fetch(`${BASE}${path}?${qs}`)
  if (!res.ok) throw new Error(`Spoonacular ${res.status}`)
  return res.json() as Promise<T>
}

export async function searchSpoonacular(query: string): Promise<SpoonacularHit[]> {
  const data = await call<{ results: SpoonacularHit[] }>('/recipes/complexSearch', {
    query,
    number: '8',
  })
  return data.results
}

/** Convierte unidades US habituales a gramos aproximados. */
function toGrams(amount: number, unit: string): { quantity: number; unit: string } {
  const u = unit.toLowerCase()
  if (u === 'g' || u === 'gram' || u === 'grams') return { quantity: amount, unit: 'g' }
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return { quantity: amount, unit: 'ml' }
  if (u === 'kg') return { quantity: amount * 1000, unit: 'g' }
  if (u === 'l' || u === 'liter') return { quantity: amount * 1000, unit: 'ml' }
  if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return { quantity: amount, unit: 'cda' }
  if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return { quantity: amount, unit: 'cdta' }
  if (u === 'cup' || u === 'cups') return { quantity: amount * 240, unit: 'ml' }
  if (u === 'oz' || u === 'ounce' || u === 'ounces') return { quantity: amount * 28, unit: 'g' }
  if (u === 'lb' || u === 'pound' || u === 'pounds') return { quantity: amount * 454, unit: 'g' }
  return { quantity: amount, unit: 'pieza' }
}

export async function importSpoonacularRecipe(
  spoonacularId: number,
  householdId: string,
  userId: string,
): Promise<string> {
  const r = await call<SpoonacularRecipe>(`/recipes/${spoonacularId}/information`, {
    includeNutrition: 'false',
  })

  const instructions =
    r.analyzedInstructions?.[0]?.steps.map((s) => s.step).join('\n') ?? ''

  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({
      household_id: householdId,
      created_by: userId,
      name: r.title,
      description: r.summary ? r.summary.replace(/<[^>]+>/g, '').slice(0, 200) : null,
      instructions: instructions || null,
      servings: r.servings || 2,
      prep_minutes: r.preparationMinutes ?? 10,
      cook_minutes: r.cookingMinutes ?? r.readyInMinutes ?? 30,
      tags: ['importada'],
      source_url: r.sourceUrl ?? null,
      image_url: r.image ?? null,
    })
    .select('id')
    .single()
  if (error || !recipe) throw new Error(error?.message ?? 'No se pudo crear la receta')

  // Empareja por nombre con ingredientes locales; crea los que falten sin
  // nutrición (editable después) para no perder líneas de la receta.
  const lines: { recipe_id: string; ingredient_id: number; quantity: number; unit: string }[] = []
  for (const ing of r.extendedIngredients) {
    const name = ing.name.toLowerCase().trim()
    let { data: existing } = await supabase.from('ingredients').select('id').eq('name', name).maybeSingle()
    if (!existing) {
      const { data: created } = await supabase
        .from('ingredients')
        .insert({ name, default_unit: 'g' })
        .select('id')
        .single()
      existing = created
    }
    if (!existing) continue
    const conv = toGrams(ing.amount, ing.unit)
    // evita duplicados (la API a veces repite ingrediente)
    if (!lines.some((l) => l.ingredient_id === existing!.id)) {
      lines.push({ recipe_id: recipe.id, ingredient_id: existing.id, quantity: conv.quantity, unit: conv.unit })
    }
  }
  if (lines.length) await supabase.from('recipe_ingredients').insert(lines)

  return recipe.id
}
