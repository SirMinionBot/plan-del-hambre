import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../hooks/useHousehold'
import type { WeekData } from '../hooks/useWeekData'
import { Button } from './ui/Button'
import { Input, Select } from './ui/Field'
import { Banner } from './ui/Banner'
import { Picker, type PickerItem } from './ui/Picker'
import type { MealEntry, MealEntryType, MealSlot, Recipe } from '../types/db'

const TYPES: MealEntryType[] = ['normal', 'fuera', 'cheat', 'evento', 'sobras']

interface MemberRow {
  servings: number
  recipe_id: string | null // override divergente
}

export function SlotEditor({
  date,
  slot,
  entry,
  week,
  onClose,
}: {
  date: string
  slot: MealSlot
  entry: MealEntry | null
  week: WeekData
  onClose: (changed: boolean) => void
}) {
  const { household, me, partner } = useHousehold()
  const [recipes, setRecipes] = useState<Pick<Recipe, 'id' | 'name' | 'prep_minutes' | 'cook_minutes'>[]>([])
  const [type, setType] = useState<MealEntryType>(entry?.entry_type ?? 'normal')
  const [recipeId, setRecipeId] = useState<string>(entry?.recipe_id ?? '')
  const [cook, setCook] = useState<string>(entry?.cook_user_id ?? '')
  const [pinned, setPinned] = useState(entry?.pinned ?? false)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [rows, setRows] = useState<Record<string, MemberRow>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const members = [me, partner].filter(Boolean)

  useEffect(() => {
    supabase
      .from('recipes')
      .select('id, name, prep_minutes, cook_minutes')
      .order('name')
      .then(({ data }) => setRecipes(data ?? []))
  }, [])

  const recipeItems: PickerItem[] = recipes.map((r) => ({
    id: r.id,
    label: r.name,
    sublabel: `${r.prep_minutes + r.cook_minutes} min`,
  }))
  const recipeName = (id: string | null) => recipes.find((r) => r.id === id)?.name ?? ''

  useEffect(() => {
    const initial: Record<string, MemberRow> = {}
    for (const m of members) {
      const p = entry ? week.portions.find((p) => p.entry_id === entry.id && p.user_id === m!.user_id) : null
      initial[m!.user_id] = { servings: p?.servings ?? 1, recipe_id: p?.recipe_id ?? null }
    }
    setRows(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, me?.user_id, partner?.user_id])

  async function save() {
    setBusy(true)
    setError(null)
    let entryId = entry?.id
    const payload = {
      household_id: household!.id,
      date,
      meal_slot: slot,
      entry_type: type,
      recipe_id: type === 'normal' || type === 'sobras' ? recipeId || null : null,
      cook_user_id: type === 'normal' || type === 'sobras' ? cook || null : null,
      pinned,
      notes: notes || null,
    }
    if (entryId) {
      const { error } = await supabase.from('meal_entries').update(payload).eq('id', entryId)
      if (error) return fail(error.message)
    } else {
      const { data, error } = await supabase.from('meal_entries').insert(payload).select('id').single()
      if (error) return fail(error.message)
      entryId = data.id
    }
    const portions = members.map((m) => ({
      entry_id: entryId!,
      user_id: m!.user_id,
      servings: rows[m!.user_id]?.servings ?? 1,
      recipe_id: rows[m!.user_id]?.recipe_id ?? null,
    }))
    const { error: pErr } = await supabase.from('meal_entry_portions').upsert(portions)
    if (pErr) return fail(pErr.message)
    onClose(true)
  }

  function fail(message: string) {
    setError(message)
    setBusy(false)
  }

  async function remove() {
    if (!entry) return onClose(false)
    await supabase.from('meal_entries').delete().eq('id', entry.id)
    onClose(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={() => onClose(false)}>
      <div
        className="border-brutal shadow-brutal-lg flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 data-numeric>
          {slot} · {date}
        </h2>

        <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as MealEntryType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>

        {(type === 'normal' || type === 'sobras') && (
          <>
            <Picker
              label="Receta"
              value={recipeName(recipeId || null)}
              placeholder="elegir receta..."
              items={recipeItems}
              clearLabel="— sin receta —"
              onSelect={(id) => setRecipeId(id ?? '')}
            />

            <Select label="Cocina" value={cook} onChange={(e) => setCook(e.target.value)}>
              <option value="">— nadie asignado —</option>
              {members.map((m) => (
                <option key={m!.user_id} value={m!.user_id}>
                  {m!.profile.display_name}
                </option>
              ))}
            </Select>

            <fieldset className="border-brutal-thin flex flex-col gap-2 p-3">
              <legend className="px-1 text-xs font-bold uppercase">Raciones y divergencias</legend>
              {members.map((m) => (
                <div key={m!.user_id} className="grid grid-cols-[1fr_5rem_1fr] items-end gap-2">
                  <span className="text-xs font-bold uppercase">{m!.profile.display_name}</span>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={rows[m!.user_id]?.servings ?? 1}
                    onChange={(e) =>
                      setRows({ ...rows, [m!.user_id]: { ...rows[m!.user_id], servings: Number(e.target.value) } })
                    }
                  />
                  <Picker
                    value={recipeName(rows[m!.user_id]?.recipe_id ?? null)}
                    placeholder="misma receta"
                    items={recipeItems}
                    clearLabel="misma receta"
                    onSelect={(id) =>
                      setRows({ ...rows, [m!.user_id]: { ...rows[m!.user_id], recipe_id: id } })
                    }
                  />
                </div>
              ))}
            </fieldset>
          </>
        )}

        <label className="flex items-center gap-2 text-xs font-bold uppercase">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-ink" />
          Petición de la semana (el planificador no la toca)
        </label>

        <Input label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error && <Banner variant="error">{error}</Banner>}

        <div className="flex justify-between gap-2">
          <Button variant="danger" onClick={remove} disabled={busy}>
            Vaciar slot
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => onClose(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
