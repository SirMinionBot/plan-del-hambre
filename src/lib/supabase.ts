import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error('FALTAN VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copia .env.example a .env')
}

export const supabase = createClient(url, anonKey)

export const spoonacularKey = (import.meta.env.VITE_SPOONACULAR_KEY as string | undefined) ?? null
