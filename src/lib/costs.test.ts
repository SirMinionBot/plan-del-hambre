import { describe, expect, it } from 'vitest'
import type { CurrentPrice, Ingredient, Recipe, RecipeIngredient } from '../types/db'
import { compareSupermarkets, indexPrices, recipeCost, weekCost } from './costs'

function mkIng(id: number, over: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: `ing-${id}`,
    category_id: null,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    default_unit: 'g',
    grams_per_unit: null,
    estimated_price_per_100g: null,
    typically_frozen: false,
    ...over,
  }
}

function mkRecipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    household_id: null,
    created_by: null,
    name: 'receta',
    description: null,
    instructions: null,
    servings: 2,
    prep_minutes: 0,
    cook_minutes: 0,
    tags: [],
    season: 'todo-el-ano',
    batch_days: 1,
    main_ingredient: null,
    estimated_cost: null,
    image_url: null,
    source_url: null,
    ...over,
  }
}

function obs(ingredient_id: number, supermarket_id: number, price: number, over: Partial<CurrentPrice> = {}): CurrentPrice {
  return {
    household_id: 'h1',
    ingredient_id,
    supermarket_id,
    price,
    quantity: null,
    unit: null,
    seen_on: '2026-06-01',
    ...over,
  }
}

const line = (ingredient_id: number, quantity: number, unit = 'g'): RecipeIngredient => ({
  recipe_id: 'r1',
  ingredient_id,
  quantity,
  unit,
})

// pollo: comprado a peso; cebolla: por pieza; arroz: solo precio estimado
const POLLO = mkIng(1, { grams_per_unit: null })
const CEBOLLA = mkIng(2, { default_unit: 'pieza', grams_per_unit: 150 })
const ARROZ = mkIng(3, { estimated_price_per_100g: 0.2 })
const INGS = new Map([[1, POLLO], [2, CEBOLLA], [3, ARROZ]])

describe('recipeCost', () => {
  it('precio a peso (kg): convierte a €/g y multiplica por los gramos de la línea', () => {
    // 0.5 kg de pollo a 3,00 € → 6 €/kg; la receta lleva 300 g → 1,80 €
    const idx = indexPrices([obs(1, 1, 3, { quantity: 0.5, unit: 'kg' })])
    const c = recipeCost(mkRecipe(), [line(1, 300)], INGS, idx, 1)
    expect(c).toMatchObject({ total: 1.8, perServing: 0.9, covered: 1, realCovered: 1, lines: 1 })
  })

  it('precio por envase sin cantidad en ingrediente por pieza: € por pieza', () => {
    // cebolla 0,60 € el envase (asumido 1 pieza); receta lleva 2 piezas → 1,20 €
    const idx = indexPrices([obs(2, 1, 0.6)])
    const c = recipeCost(mkRecipe(), [line(2, 2, 'pieza')], INGS, idx, 1)
    expect(c?.total).toBe(1.2)
    expect(c?.realCovered).toBe(1)
  })

  it('multipack (ud): reparte el precio del envase entre sus unidades', () => {
    // pack de 6 a 1,80 € → 0,30 €/ud; receta lleva 3 piezas → 0,90 €
    const idx = indexPrices([obs(2, 1, 1.8, { quantity: 6, unit: 'ud' })])
    const c = recipeCost(mkRecipe(), [line(2, 3, 'pieza')], INGS, idx, 1)
    expect(c?.total).toBe(0.9)
  })

  it('sin precio real cae al estimado del catálogo y no cuenta como real', () => {
    const c = recipeCost(mkRecipe(), [line(3, 200)], INGS, indexPrices([]), 1)
    expect(c).toMatchObject({ total: 0.4, covered: 1, realCovered: 0 })
  })

  it('cobertura parcial: informa cubiertas vs totales y no inventa lo que falta', () => {
    const idx = indexPrices([obs(1, 1, 3, { quantity: 0.5, unit: 'kg' })])
    const c = recipeCost(mkRecipe(), [line(1, 300), line(2, 1, 'pieza')], INGS, idx, 1)
    expect(c).toMatchObject({ total: 1.8, covered: 1, lines: 2 })
  })

  it('sin ninguna línea con precio devuelve null', () => {
    expect(recipeCost(mkRecipe(), [line(1, 300)], INGS, indexPrices([]), 1)).toBeNull()
  })

  it('supermarketId null elige el más barato entre cadenas', () => {
    const idx = indexPrices([
      obs(1, 1, 4, { quantity: 0.5, unit: 'kg' }), // 8 €/kg en súper 1
      obs(1, 2, 3, { quantity: 0.5, unit: 'kg' }), // 6 €/kg en súper 2
    ])
    const c = recipeCost(mkRecipe(), [line(1, 100)], INGS, idx, null, [1, 2])
    expect(c?.total).toBe(0.6)
  })
})

describe('weekCost y compareSupermarkets', () => {
  const idx = indexPrices([
    obs(1, 1, 3, { quantity: 0.5, unit: 'kg' }), // pollo 6 €/kg en súper 1
    obs(1, 2, 2.5, { quantity: 0.5, unit: 'kg' }), // pollo 5 €/kg en súper 2
    obs(2, 1, 0.6), // cebolla solo en súper 1
  ])
  const meals = [
    { recipe: mkRecipe(), lines: [line(1, 300)] },
    { recipe: mkRecipe({ id: 'r2' }), lines: [line(2, 2, 'pieza')] },
  ]

  it('suma las comidas calculables e informa la cobertura', () => {
    const w = weekCost(meals, INGS, idx, 1)
    expect(w).toMatchObject({ total: 3, meals: 2, coveredMeals: 2 }) // 1,80 + 1,20
  })

  it('ordena los súpers de barato a caro con sus totales', () => {
    const cmp = compareSupermarkets(meals, INGS, idx, [1, 2])
    expect(cmp[0]).toMatchObject({ supermarketId: 2, total: 1.5, coveredMeals: 1 })
    expect(cmp[1]).toMatchObject({ supermarketId: 1, total: 3, coveredMeals: 2 })
  })
})
