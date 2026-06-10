import type { Ingredient, MacrosPerServing, Recipe, RecipeIngredient } from '../types/db'

/** Gramos reales de una línea de receta según su unidad. */
export function lineGrams(line: RecipeIngredient, ing: Ingredient): number {
  if (line.unit === 'g' || line.unit === 'ml') return line.quantity
  return line.quantity * (ing.grams_per_unit ?? 0)
}

/** Macros por ración derivadas de los ingredientes (única fuente de verdad nutricional). */
export function macrosPerServing(
  recipe: Recipe,
  lines: RecipeIngredient[],
  ingredientsById: Map<number, Ingredient>,
): MacrosPerServing {
  const total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  for (const line of lines) {
    const ing = ingredientsById.get(line.ingredient_id)
    if (!ing) continue
    const g = lineGrams(line, ing) / 100
    total.calories += ing.calories * g
    total.protein_g += ing.protein_g * g
    total.carbs_g += ing.carbs_g * g
    total.fat_g += ing.fat_g * g
  }
  const s = Math.max(recipe.servings, 1)
  return {
    calories: Math.round(total.calories / s),
    protein_g: Math.round(total.protein_g / s),
    carbs_g: Math.round(total.carbs_g / s),
    fat_g: Math.round(total.fat_g / s),
  }
}

/** Coste estimado total de la receta en €, si hay precios. */
export function estimatedCost(
  lines: RecipeIngredient[],
  ingredientsById: Map<number, Ingredient>,
): number | null {
  let cost = 0
  let any = false
  for (const line of lines) {
    const ing = ingredientsById.get(line.ingredient_id)
    if (!ing || ing.estimated_price_per_100g == null) continue
    cost += (lineGrams(line, ing) / 100) * ing.estimated_price_per_100g
    any = true
  }
  return any ? Math.round(cost * 100) / 100 : null
}
