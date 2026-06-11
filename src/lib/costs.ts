// Coste derivado de recetas y semanas a partir de precios reales por
// supermercado (vista current_prices) con fallback al precio estimado del
// catálogo. Espejo del patrón de macros.ts: funciones puras, nada almacenado.

import type { CurrentPrice, Ingredient, Recipe, RecipeIngredient } from '../types/db'
import { lineGrams } from './macros'

export interface RecipeCost {
  total: number // € de la receta completa
  perServing: number // € por ración
  covered: number // líneas con algún precio (real o estimado)
  realCovered: number // líneas con precio real (de ticket)
  lines: number // líneas totales con ingrediente
}

export interface WeekCost {
  total: number
  meals: number // comidas con receta
  coveredMeals: number // comidas con coste calculable (≥1 línea cubierta)
}

/** Índice de precios vigentes por "ingrediente:súper". */
export function indexPrices(prices: CurrentPrice[]): Map<string, CurrentPrice> {
  return new Map(prices.map((p) => [`${p.ingredient_id}:${p.supermarket_id}`, p]))
}

/** €/gramo de una observación, si la unidad del envase lo permite derivar. */
function pricePerGram(obs: CurrentPrice, ing: Ingredient): number | null {
  if (obs.unit === 'kg' && obs.quantity) return obs.price / (obs.quantity * 1000)
  if (obs.unit === 'ud' && obs.quantity && ing.grams_per_unit) {
    return obs.price / (obs.quantity * ing.grams_per_unit)
  }
  // envase sin cantidad: solo es derivable si el ingrediente se compra por pieza
  if (obs.quantity == null && ing.default_unit === 'pieza' && ing.grams_per_unit) {
    return obs.price / ing.grams_per_unit
  }
  return null
}

/** Coste en € de una línea de receta. real=true si vino de precio de ticket. */
function lineCost(
  line: RecipeIngredient,
  ing: Ingredient,
  obs: CurrentPrice | undefined,
): { cost: number; real: boolean } | null {
  if (obs) {
    const perGram = pricePerGram(obs, ing)
    if (perGram !== null) return { cost: lineGrams(line, ing) * perGram, real: true }
    // por pieza: precio del envase repartido entre sus unidades
    if (line.unit === 'pieza' && (obs.unit === 'ud' || obs.quantity == null)) {
      return { cost: line.quantity * (obs.price / (obs.quantity ?? 1)), real: true }
    }
  }
  if (ing.estimated_price_per_100g != null) {
    return { cost: (lineGrams(line, ing) / 100) * ing.estimated_price_per_100g, real: false }
  }
  return null
}

/**
 * Coste de una receta con los precios vigentes de un súper (o el más barato
 * entre los súpers con datos si supermarketId es null). null si ninguna línea
 * tiene precio.
 */
export function recipeCost(
  recipe: Recipe,
  lines: RecipeIngredient[],
  ingredientsById: Map<number, Ingredient>,
  priceIndex: Map<string, CurrentPrice>,
  supermarketId: number | null,
  supermarketIds: number[] = [],
): RecipeCost | null {
  let total = 0
  let covered = 0
  let realCovered = 0
  let counted = 0
  for (const line of lines) {
    const ing = ingredientsById.get(line.ingredient_id)
    if (!ing) continue
    counted++
    let obs: CurrentPrice | undefined
    if (supermarketId !== null) {
      obs = priceIndex.get(`${line.ingredient_id}:${supermarketId}`)
    } else {
      // el más barato entre cadenas con observación
      for (const sid of supermarketIds) {
        const candidate = priceIndex.get(`${line.ingredient_id}:${sid}`)
        if (candidate && (!obs || candidate.price < obs.price)) obs = candidate
      }
    }
    const c = lineCost(line, ing, obs)
    if (!c) continue
    total += c.cost
    covered++
    if (c.real) realCovered++
  }
  if (covered === 0) return null
  return {
    total: Math.round(total * 100) / 100,
    perServing: Math.round((total / Math.max(recipe.servings, 1)) * 100) / 100,
    covered,
    realCovered,
    lines: counted,
  }
}

/** Coste previsto de un conjunto de comidas planificadas (la semana). */
export function weekCost(
  meals: Array<{ recipe: Recipe; lines: RecipeIngredient[] }>,
  ingredientsById: Map<number, Ingredient>,
  priceIndex: Map<string, CurrentPrice>,
  supermarketId: number | null,
  supermarketIds: number[] = [],
): WeekCost {
  let total = 0
  let coveredMeals = 0
  for (const { recipe, lines } of meals) {
    const c = recipeCost(recipe, lines, ingredientsById, priceIndex, supermarketId, supermarketIds)
    if (!c) continue
    total += c.total
    coveredMeals++
  }
  return { total: Math.round(total * 100) / 100, meals: meals.length, coveredMeals }
}

/** Total de la semana en cada súper con datos, ordenado de barato a caro. */
export function compareSupermarkets(
  meals: Array<{ recipe: Recipe; lines: RecipeIngredient[] }>,
  ingredientsById: Map<number, Ingredient>,
  priceIndex: Map<string, CurrentPrice>,
  supermarketIds: number[],
): Array<{ supermarketId: number; total: number; coveredMeals: number }> {
  return supermarketIds
    .map((sid) => {
      const w = weekCost(meals, ingredientsById, priceIndex, sid)
      return { supermarketId: sid, total: w.total, coveredMeals: w.coveredMeals }
    })
    .filter((r) => r.coveredMeals > 0)
    .sort((a, b) => a.total - b.total)
}
