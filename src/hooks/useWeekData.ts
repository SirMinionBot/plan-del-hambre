import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { weekDates } from '../lib/dates'
import { useHousehold } from './useHousehold'
import type {
  Ingredient,
  MealEntry,
  MealEntryPortion,
  Recipe,
  RecipeIngredient,
} from '../types/db'

export interface WeekData {
  dates: string[]
  entries: MealEntry[]
  portions: MealEntryPortion[]
  recipesById: Map<string, Recipe>
  recipeIngredients: Map<string, RecipeIngredient[]>
  ingredientsById: Map<number, Ingredient>
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
    loading: true,
  })

  const from = dates[0]
  const to = dates[6]

  const reload = useCallback(async () => {
    if (!household) return
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

    const [{ data: recipes }, { data: lines }, { data: ingredients }] = await Promise.all([
      recipeIds.length
        ? supabase.from('recipes').select('*').in('id', recipeIds)
        : Promise.resolve({ data: [] as Recipe[] }),
      recipeIds.length
        ? supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds)
        : Promise.resolve({ data: [] as RecipeIngredient[] }),
      supabase.from('ingredients').select('*'),
    ])

    const recipeIngredients = new Map<string, RecipeIngredient[]>()
    for (const l of lines ?? []) {
      const arr = recipeIngredients.get(l.recipe_id) ?? []
      arr.push(l)
      recipeIngredients.set(l.recipe_id, arr)
    }

    setState({
      entries: entries ?? [],
      portions: portions ?? [],
      recipesById: new Map((recipes ?? []).map((r) => [r.id, r])),
      recipeIngredients,
      ingredientsById: new Map((ingredients ?? []).map((i) => [i.id, i])),
      loading: false,
    })
  }, [household, from, to])

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    void reload()
  }, [reload])

  return { ...state, dates, reload }
}
