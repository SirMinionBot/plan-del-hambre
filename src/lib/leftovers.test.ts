import { describe, expect, it } from 'vitest'
import type { Ingredient, MealEntry } from '../types/db'
import { availableLeftovers, suggestFreeze } from './leftovers'

function entry(over: Partial<MealEntry>): MealEntry {
  return {
    id: 'e1',
    household_id: 'h1',
    date: '2026-06-08',
    meal_slot: 'comida',
    entry_type: 'normal',
    recipe_id: 'r1',
    cook_user_id: null,
    cooked_at: '2026-06-08T14:00:00Z',
    pinned: false,
    notes: null,
    leftover_servings: 2,
    frozen: false,
    source_entry_id: null,
    ...over,
  }
}

const TODAY = '2026-06-10'

describe('availableLeftovers', () => {
  it('sobra de nevera vigente: disponible con su caducidad y días restantes', () => {
    const [l] = availableLeftovers([entry({})], TODAY) // cocinada el 8 → hasta el 11
    expect(l).toMatchObject({ servings: 2, expiresOn: '2026-06-11', daysLeft: 1 })
  })

  it('sobra de nevera con más de 3 días deja de ofrecerse', () => {
    const ls = availableLeftovers([entry({ cooked_at: '2026-06-05T14:00:00Z' })], TODAY)
    expect(ls).toHaveLength(0)
  })

  it('congelada: sin límite y al final de la lista', () => {
    const ls = availableLeftovers(
      [entry({ id: 'f', frozen: true, cooked_at: '2026-05-01T14:00:00Z' }), entry({})],
      TODAY,
    )
    expect(ls.map((l) => l.entry.id)).toEqual(['e1', 'f'])
    expect(ls[1]).toMatchObject({ expiresOn: null, daysLeft: null })
  })

  it('sin raciones registradas o sin cocinar no hay sobra', () => {
    expect(availableLeftovers([entry({ leftover_servings: 0 })], TODAY)).toHaveLength(0)
    expect(availableLeftovers([entry({ cooked_at: null })], TODAY)).toHaveLength(0)
  })

  it('ordena por urgencia: lo que caduca antes, primero', () => {
    const ls = availableLeftovers(
      [entry({ id: 'fresca', cooked_at: '2026-06-10T09:00:00Z' }), entry({ id: 'urgente', cooked_at: '2026-06-07T14:00:00Z' })],
      TODAY,
    )
    expect(ls.map((l) => l.entry.id)).toEqual(['urgente', 'fresca'])
  })
})

describe('suggestFreeze', () => {
  const congelable = { typically_frozen: true } as Ingredient
  const fresco = { typically_frozen: false } as Ingredient
  const ings = new Map([[1, congelable], [2, fresco]])
  const lines = (ids: number[]) => ids.map((ingredient_id) => ({ recipe_id: 'r1', ingredient_id, quantity: 100, unit: 'g' }))

  it('último día de ventana + ingrediente congelable → sugerir', () => {
    const [l] = availableLeftovers([entry({ cooked_at: '2026-06-07T14:00:00Z' })], TODAY) // caduca hoy
    expect(suggestFreeze(l, lines([1, 2]), ings)).toBe(true)
  })

  it('con días de margen no molesta', () => {
    const [l] = availableLeftovers([entry({})], TODAY) // queda 1 día... justo el límite
    const [fresh] = availableLeftovers([entry({ cooked_at: TODAY + 'T09:00:00Z' })], TODAY)
    expect(suggestFreeze(fresh, lines([1]), ings)).toBe(false)
    expect(suggestFreeze(l, lines([1]), ings)).toBe(true) // daysLeft 1 = avisa
  })

  it('nada congelable en la receta → no sugerir, y congeladas nunca', () => {
    const [l] = availableLeftovers([entry({ cooked_at: '2026-06-07T14:00:00Z' })], TODAY)
    expect(suggestFreeze(l, lines([2]), ings)).toBe(false)
    const [f] = availableLeftovers([entry({ frozen: true })], TODAY)
    expect(suggestFreeze(f, lines([1]), ings)).toBe(false)
  })
})
