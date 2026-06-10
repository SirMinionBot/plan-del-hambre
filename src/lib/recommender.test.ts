import { describe, expect, it } from 'vitest'
import type {
  MealEntry,
  MealSlot,
  Recipe,
  RecipeIngredient,
  RecipeRating,
  WeekTemplateSlot,
} from '../types/db'
import {
  filterCandidates,
  planWeek,
  rankForSlot,
  scoreRecipe,
  type PlannerContext,
  type SlotInfo,
} from './recommender'

// --- Fixtures mínimos ---

function makeRecipe(over: Partial<Recipe> & { id: string }): Recipe {
  return {
    household_id: null,
    created_by: null,
    name: over.id,
    description: null,
    instructions: null,
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 20,
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

function rating(user_id: string, recipe_id: string, value: number | null, vetoed = false): RecipeRating {
  return { user_id, recipe_id, rating: value, vetoed }
}

function recipeIngredient(recipe_id: string, ingredient_id: number): RecipeIngredient {
  return { recipe_id, ingredient_id, quantity: 100, unit: 'g' }
}

function makeCtx(over: Partial<PlannerContext> = {}): PlannerContext {
  return {
    members: ['ana', 'bruno'],
    ratings: [],
    exclusions: [],
    recipeIngredients: new Map(),
    recentHistory: [],
    pantry: [],
    weekIngredientIds: new Set(),
    season: 'verano',
    calorieGoals: { ana: 2000, bruno: 2000 },
    plannedCaloriesByUser: { ana: 0, bruno: 0 },
    macrosByRecipe: new Map(),
    ...over,
  }
}

function makeEntry(over: Partial<MealEntry> & { date: string; meal_slot: MealSlot }): MealEntry {
  return {
    id: 'entry-1',
    household_id: 'h1',
    entry_type: 'normal',
    recipe_id: null,
    cook_user_id: null,
    cooked_at: null,
    pinned: false,
    notes: null,
    ...over,
  }
}

function templateSlot(over: Partial<WeekTemplateSlot> & { weekday: number; meal_slot: MealSlot }): WeekTemplateSlot {
  return {
    id: 'tpl-slot-1',
    template_id: 'tpl-1',
    required_tags: [],
    excluded_tags: [],
    max_total_minutes: null,
    ...over,
  }
}

// 2026-06-08 es lunes; 2026-06-13/14 fin de semana.
const LUNES = '2026-06-08'
const MARTES = '2026-06-09'
const SLOT_COMIDA: SlotInfo = { date: LUNES, meal_slot: 'comida', isWeekend: false }

// --- Tests ---

describe('filterCandidates', () => {
  it('el veto de UN miembro excluye la receta siempre', () => {
    const lentejas = makeRecipe({ id: 'lentejas' })
    const pasta = makeRecipe({ id: 'pasta' })
    const ctx = makeCtx({
      ratings: [
        rating('ana', 'lentejas', 5), // a ana le encanta...
        rating('bruno', 'lentejas', null, true), // ...pero bruno la veta.
      ],
    })
    const result = filterCandidates([lentejas, pasta], ctx)
    expect(result.map((r) => r.id)).toEqual(['pasta'])
  })

  it('un ingrediente excluido por cualquier miembro excluye la receta', () => {
    const conChampis = makeRecipe({ id: 'risotto' })
    const sinChampis = makeRecipe({ id: 'arroz-blanco' })
    const ctx = makeCtx({
      exclusions: [{ user_id: 'bruno', ingredient_id: 42, reason: 'alergia' }],
      recipeIngredients: new Map([
        ['risotto', [recipeIngredient('risotto', 42), recipeIngredient('risotto', 7)]],
        ['arroz-blanco', [recipeIngredient('arroz-blanco', 7)]],
      ]),
    })
    const result = filterCandidates([conChampis, sinChampis], ctx)
    expect(result.map((r) => r.id)).toEqual(['arroz-blanco'])
  })
})

describe('scoreRecipe', () => {
  it('el menos entusiasta manda: 4/4 gana a 5/2 en el componente gusto', () => {
    const polarizante = makeRecipe({ id: 'polarizante' })
    const consenso = makeRecipe({ id: 'consenso' })
    const ctx = makeCtx({
      ratings: [
        rating('ana', 'polarizante', 5),
        rating('bruno', 'polarizante', 2),
        rating('ana', 'consenso', 4),
        rating('bruno', 'consenso', 4),
      ],
    })
    const gustoPolarizante = scoreRecipe(polarizante, SLOT_COMIDA, ctx).breakdown.find(
      (c) => c.key === 'gusto',
    )!
    const gustoConsenso = scoreRecipe(consenso, SLOT_COMIDA, ctx).breakdown.find(
      (c) => c.key === 'gusto',
    )!
    expect(gustoConsenso.points).toBeGreaterThan(gustoPolarizante.points)
    expect(gustoPolarizante.points).toBeLessThan(0) // mínimo 2 penaliza
  })

  it('penaliza receta repetida en los últimos 10 días, y menos el mismo main_ingredient', () => {
    const pollo = makeRecipe({ id: 'pollo-asado', main_ingredient: 'pollo' })
    const otroPollo = makeRecipe({ id: 'pollo-curry', main_ingredient: 'pollo' })
    const ctx = makeCtx({
      recentHistory: [{ date: '2026-06-01', recipeId: 'pollo-asado', mainIngredient: 'pollo' }],
    })
    const repiteReceta = scoreRecipe(pollo, SLOT_COMIDA, ctx).breakdown.find(
      (c) => c.key === 'variedad',
    )!
    const repiteMain = scoreRecipe(otroPollo, SLOT_COMIDA, ctx).breakdown.find(
      (c) => c.key === 'variedad',
    )!
    expect(repiteReceta.points).toBeLessThan(0)
    expect(repiteMain.points).toBeLessThan(0)
    expect(repiteMain.points).toBeGreaterThan(repiteReceta.points) // mitad de castigo

    // Fuera de la ventana de 10 días no penaliza.
    const ctxLejano = makeCtx({
      recentHistory: [{ date: '2026-05-20', recipeId: 'pollo-asado', mainIngredient: 'pollo' }],
    })
    const sinRepetir = scoreRecipe(pollo, SLOT_COMIDA, ctxLejano).breakdown.find(
      (c) => c.key === 'variedad',
    )!
    expect(sinRepetir.points).toBe(0)
  })
})

describe('rankForSlot', () => {
  it('ordena descendente y la segunda posición sirve de "otra" candidata', () => {
    const buena = makeRecipe({ id: 'buena' })
    const regular = makeRecipe({ id: 'regular' })
    const mala = makeRecipe({ id: 'mala' })
    const ctx = makeCtx({
      ratings: [
        rating('ana', 'buena', 5),
        rating('bruno', 'buena', 5),
        rating('ana', 'regular', 4),
        rating('bruno', 'regular', 4),
        rating('ana', 'mala', 2),
        rating('bruno', 'mala', 2),
      ],
    })
    const ranked = rankForSlot([mala, buena, regular], SLOT_COMIDA, ctx)
    expect(ranked.map((c) => c.recipe.id)).toEqual(['buena', 'regular', 'mala'])
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
    // El botón "otra" tomaría el siguiente del ranking.
    expect(ranked[1].recipe.id).toBe('regular')
  })

  it('el slot desayuno solo admite recetas con tag desayuno, y viceversa', () => {
    const porridge = makeRecipe({ id: 'porridge', tags: ['desayuno'] })
    const guiso = makeRecipe({ id: 'guiso' })
    const ctx = makeCtx()
    const desayuno = rankForSlot([porridge, guiso], { ...SLOT_COMIDA, meal_slot: 'desayuno' }, ctx)
    expect(desayuno.map((c) => c.recipe.id)).toEqual(['porridge'])
    const comida = rankForSlot([porridge, guiso], SLOT_COMIDA, ctx)
    expect(comida.map((c) => c.recipe.id)).toEqual(['guiso'])
  })
})

describe('planWeek', () => {
  it('batch_days=2 coloca sobras en el slot equivalente del día siguiente', () => {
    const cocido = makeRecipe({ id: 'cocido', batch_days: 2 })
    const result = planWeek({
      weekDates: [LUNES, MARTES],
      slots: ['comida'],
      existingEntries: [],
      recipes: [cocido],
      ctx: makeCtx(),
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ date: LUNES, meal_slot: 'comida', entry_type: 'normal' })
    expect(result[1]).toMatchObject({ date: MARTES, meal_slot: 'comida', entry_type: 'sobras' })
    expect(result[1].recipe.id).toBe('cocido')
  })

  it('respeta las entradas existentes/ancladas y rellena alrededor', () => {
    const fija = makeRecipe({ id: 'fija' })
    const libre = makeRecipe({ id: 'libre' })
    const anclada = makeEntry({
      date: LUNES,
      meal_slot: 'comida',
      recipe_id: 'fija',
      pinned: true,
    })
    const result = planWeek({
      weekDates: [LUNES, MARTES],
      slots: ['comida'],
      existingEntries: [anclada],
      recipes: [fija, libre],
      ctx: makeCtx(),
    })
    // El lunes no se toca; el martes se rellena sin repetir la receta anclada.
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ date: MARTES, meal_slot: 'comida', entry_type: 'normal' })
    expect(result[0].recipe.id).toBe('libre')
  })

  it('la restricción max_total_minutes de la plantilla filtra candidatas', () => {
    const lenta = makeRecipe({ id: 'lenta', prep_minutes: 30, cook_minutes: 60 })
    const rapida = makeRecipe({ id: 'veloz', prep_minutes: 5, cook_minutes: 15 })
    const ctx = makeCtx({
      // La lenta gustaría más, pero la plantilla la deja fuera.
      ratings: [
        rating('ana', 'lenta', 5),
        rating('bruno', 'lenta', 5),
      ],
    })
    const result = planWeek({
      weekDates: [LUNES],
      slots: ['comida'],
      existingEntries: [],
      recipes: [lenta, rapida],
      ctx,
      templateSlots: [templateSlot({ weekday: 0, meal_slot: 'comida', max_total_minutes: 30 })],
    })
    expect(result).toHaveLength(1)
    expect(result[0].recipe.id).toBe('veloz')
  })

  it('no repite la misma receta dentro de la semana', () => {
    const unica = makeRecipe({ id: 'unica' })
    const otra = makeRecipe({ id: 'otra' })
    const result = planWeek({
      weekDates: [LUNES, MARTES, '2026-06-10'],
      slots: ['comida'],
      existingEntries: [],
      recipes: [unica, otra],
      ctx: makeCtx(),
    })
    // Solo hay dos recetas: el tercer día queda vacío en vez de repetir.
    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.recipe.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
