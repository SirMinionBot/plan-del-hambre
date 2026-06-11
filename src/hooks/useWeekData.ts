import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { weekDates } from '../lib/dates'
import { useHousehold } from './useHousehold'
import type {
  CurrentPrice,
  Ingredient,
  MealEntry,
  MealEntryPortion,
  Recipe,
  RecipeIngredient,
  Supermarket,
} from '../types/db'

export interface WeekData {
  dates: string[]
  entries: MealEntry[]
  portions: MealEntryPortion[]
  recipesById: Map<string, Recipe>
  recipeIngredients: Map<string, RecipeIngredient[]>
  ingredientsById: Map<number, Ingredient>
  currentPrices: CurrentPrice[]
  supermarkets: Supermarket[]
  loading: boolean
  reload: () => Promise<void>
}

/** Carga todo lo necesario para pintar/operar una semana del hogar. */
export function useWeekData(monday: Date): WeekData {
  const { household } = useHousehold()
  const dates = weekDates(monday)
  const [state, setState] = useState<Omit<WeekData, 'reload' | 'dates'>>({
    entries: [],
    portions: [],
    recipesById: new Map(),
    recipeIngredients: new Map(),
    ingredientsById: new Map(),
    currentPrices: [],
    supermarkets: [],
    loading: true,
  })

  const from = dates[0]
  const to = dates[6]

  // fetch puro: devuelve el snapshot sin tocar estado
  const fetchWeek = useCallback(async (): Promise<Omit<WeekData, 'reload' | 'dates'> | null> => {
    if (!household) return null
    const { data: entries } = await supabase
      .from('meal_entries')
      .select('*')
      .eq('household_id', household.id)
      .gte('date', from)
      .lte('date', to)

    const entryIds = (entries ?? []).map((e) => e.id)
    const { data: portions } = entryIds.length
      ? await supabase.from('meal_entry_portions').select('*').in('entry_id', entryIds)
      : { data: [] }

    const recipeIds = [
      ...new Set(
        [...(entries ?? []).map((e) => e.recipe_id), ...(portions ?? []).map((p) => p.recipe_id)].filter(
          Boolean,
        ) as string[],
      ),
    ]

    const [{ data: recipes }, { data: lines }, { data: ingredients }, { data: prices }, { data: supers }] =
      await Promise.all([
        recipeIds.length
          ? supabase.from('recipes').select('*').in('id', recipeIds)
          : Promise.resolve({ data: [] as Recipe[] }),
        recipeIds.length
          ? supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds)
          : Promise.resolve({ data: [] as RecipeIngredient[] }),
        supabase.from('ingredients').select('*'),
        supabase.from('current_prices').select('*').eq('household_id', household.id),
        supabase.from('supermarkets').select('*').order('id'),
      ])

    const recipeIngredients = new Map<string, RecipeIngredient[]>()
    for (const l of lines ?? []) {
      const arr = recipeIngredients.get(l.recipe_id) ?? []
      arr.push(l)
      recipeIngredients.set(l.recipe_id, arr)
    }

    return {
      entries: entries ?? [],
      portions: portions ?? [],
      recipesById: new Map((recipes ?? []).map((r) => [r.id, r])),
      recipeIngredients,
      ingredientsById: new Map((ingredients ?? []).map((i) => [i.id, i])),
      currentPrices: prices ?? [],
      supermarkets: supers ?? [],
      loading: false,
    }
  }, [household, from, to])

  // al cambiar de semana u hogar, vuelve a "cargando" (ajuste durante render)
  const weekKey = `${household?.id ?? ''}|${from}`
  const [prevKey, setPrevKey] = useState(weekKey)
  if (prevKey !== weekKey) {
    setPrevKey(weekKey)
    setState((s) => (s.loading ? s : { ...s, loading: true }))
  }

  const reload = useCallback(async () => {
    const snap = await fetchWeek()
    if (snap) setState(snap)
  }, [fetchWeek])

  useEffect(() => {
    let cancelled = false
    void fetchWeek().then((snap) => {
      if (!cancelled && snap) setState(snap)
    })
    return () => {
      cancelled = true
    }
  }, [fetchWeek])

  return { ...state, dates, reload }
}
