// Tipos de dominio espejo del schema de supabase/migrations/001_initial.sql

export type MealSlot = 'desayuno' | 'comida' | 'cena'
export type MealEntryType = 'normal' | 'fuera' | 'cheat' | 'evento' | 'sobras'
export type SeasonTag = 'todo-el-ano' | 'primavera' | 'verano' | 'otono' | 'invierno'
export type Accent = 'a' | 'b'

export interface Profile {
  id: string
  display_name: string
  daily_calorie_goal: number
  protein_goal_g: number | null
  carbs_goal_g: number | null
  fat_goal_g: number | null
}

export interface Household {
  id: string
  name: string
  invite_code: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  accent: Accent
}

export interface IngredientCategory {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
}

export interface Ingredient {
  id: number
  name: string
  category_id: number | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  default_unit: 'g' | 'ml' | 'pieza' | 'cdta' | 'cda' | 'taza'
  grams_per_unit: number | null
  estimated_price_per_100g: number | null
}

export interface Recipe {
  id: string
  household_id: string | null // null = catálogo global seed
  created_by: string | null
  name: string
  description: string | null
  instructions: string | null
  servings: number
  prep_minutes: number
  cook_minutes: number
  tags: string[]
  season: SeasonTag
  batch_days: number
  main_ingredient: string | null
  estimated_cost: number | null
  image_url: string | null
  source_url: string | null
}

export interface RecipeIngredient {
  recipe_id: string
  ingredient_id: number
  quantity: number
  unit: string
}

export interface RecipeRating {
  user_id: string
  recipe_id: string
  rating: number | null
  vetoed: boolean
}

export interface UserExcludedIngredient {
  user_id: string
  ingredient_id: number
  reason: string | null
}

export interface MealEntry {
  id: string
  household_id: string
  date: string // YYYY-MM-DD
  meal_slot: MealSlot
  entry_type: MealEntryType
  recipe_id: string | null
  cook_user_id: string | null
  cooked_at: string | null
  pinned: boolean
  notes: string | null
}

export interface MealEntryPortion {
  entry_id: string
  user_id: string
  servings: number
  recipe_id: string | null // override para comidas divergentes
}

export interface PantryItem {
  id: string
  household_id: string
  name: string
  ingredient_id: number | null
  expires_on: string | null
  added_by: string | null
}

export interface ShoppingList {
  id: string
  household_id: string
  week_start: string
}

export interface ShoppingListItem {
  id: string
  list_id: string
  ingredient_id: number | null
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
  in_pantry: boolean
  checked: boolean
  checked_by: string | null
  sort_order: number
}

export interface WeekTemplate {
  id: string
  household_id: string | null // null = plantilla de serie
  name: string
  description: string | null
}

export interface WeekTemplateSlot {
  id: string
  template_id: string
  weekday: number // 0 = lunes ... 6 = domingo
  meal_slot: MealSlot
  required_tags: string[]
  excluded_tags: string[]
  max_total_minutes: number | null
}

/** Macros por ración, derivadas de los ingredientes de una receta. */
export interface MacrosPerServing {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}
