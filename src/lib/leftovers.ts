// Sobras: disponibilidad y ventana de frescura. La sobra es un atributo de la
// comida cocinada (meal_entries.leftover_servings); al planificar su consumo
// se descuenta del origen, así que "disponible" = leftover_servings vigente.

import { addDays } from './dates'
import type { Ingredient, MealEntry, RecipeIngredient } from '../types/db'

/** Días que aguanta una sobra en la nevera desde que se cocinó. */
export const FRIDGE_DAYS = 3

export interface AvailableLeftover {
  entry: MealEntry // la comida de origen (con recipe_id y raciones)
  servings: number
  /** Último día de consumo (null si está congelada: sin límite en esta iteración). */
  expiresOn: string | null
  /** Días que quedan de ventana (null si congelada). 0 = hoy es el último día. */
  daysLeft: number | null
}

/** Sobras consumibles hoy: registradas, dentro de ventana (o congeladas). */
export function availableLeftovers(entries: MealEntry[], today: string): AvailableLeftover[] {
  const out: AvailableLeftover[] = []
  for (const e of entries) {
    if (e.leftover_servings <= 0 || !e.cooked_at) continue
    if (e.frozen) {
      out.push({ entry: e, servings: e.leftover_servings, expiresOn: null, daysLeft: null })
      continue
    }
    const expiresOn = addDays(e.cooked_at.slice(0, 10), FRIDGE_DAYS)
    if (expiresOn < today) continue
    const daysLeft = Math.round(
      (new Date(expiresOn + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000,
    )
    out.push({ entry: e, servings: e.leftover_servings, expiresOn, daysLeft })
  }
  // las que antes caducan, primero (congeladas al final)
  return out.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
}

/**
 * ¿Sugerir congelarla? Última oportunidad de la ventana de nevera y la receta
 * lleva algún ingrediente que típicamente se congela.
 */
export function suggestFreeze(
  leftover: AvailableLeftover,
  lines: RecipeIngredient[],
  ingredientsById: Map<number, Ingredient>,
): boolean {
  if (leftover.daysLeft === null || leftover.daysLeft > 1) return false
  return lines.some((l) => ingredientsById.get(l.ingredient_id)?.typically_frozen)
}
