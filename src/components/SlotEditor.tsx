import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDays, toISODate } from '../lib/dates'
import { availableLeftovers, type AvailableLeftover } from '../lib/leftovers'
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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // fiambreras consumibles; al elegir una se enlaza el origen para descontar
  const [available, setAvailable] = useState<AvailableLeftover[]>([])
  const [sourceEntry, setSourceEntry] = useState<MealEntry | null>(null)

  const members = [me, partner].filter(Boolean)

  // estado inicial por miembro; el editor se monta con key por celda (Calendar),
  // así que basta con calcularlo una vez
  const [rows, setRows] = useState<Record<string, MemberRow>>(() => {
    const initial: Record<string, MemberRow> = {}
    for (const m of members) {
      const p = entry ? week.portions.find((p) => p.entry_id === entry.id && p.user_id === m!.user_id) : null
      initial[m!.user_id] = { servings: p?.servings ?? 1, recipe_id: p?.recipe_id ?? null }
    }
    return initial
  })

  useEffect(() => {
    supabase
      .from('recipes')
      .select('id, name, prep_minutes, cook_minutes')
      .order('name')
      .then(({ data }) => setRecipes(data ?? []))
  }, [])

  useEffect(() => {
    if (!household) return
    const today = toISODate(new Date())
    supabase
      .from('meal_entries')
      .select('*')
      .eq('household_id', household.id)
      .gt('leftover_servings', 0)
      .not('cooked_at', 'is', null)
      .gte('date', addDays(today, -10))
      .then(({ data }) => setAvailable(availableLeftovers(data ?? [], today)))
  }, [household])

  const recipeItems: PickerItem[] = recipes.map((r) => ({
    id: r.id,
    label: r.name,
    sublabel: `${r.prep_minutes + r.cook_minutes} min`,
  }))
  const recipeName = (id: string | null) => recipes.find((r) => r.id === id)?.name ?? ''

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
      source_entry_id: type === 'sobras' ? (sourceEntry?.id ?? entry?.source_entry_id ?? null) : null,
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
    // consumir la sobra: descuenta del origen lo que se va a comer
    if (type === 'sobras' && sourceEntry) {
      const consumed = members.reduce((acc, m) => acc + (rows[m!.user_id]?.servings ?? 1), 0)
      await supabase
        .from('meal_entries')
        .update({ leftover_servings: Math.max(0, sourceEntry.leftover_servings - consumed) })
        .eq('id', sourceEntry.id)
    }
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

        {available.length > 0 && (
          <div className="border-brutal-thin flex flex-col gap-2 bg-warn/20 p-3">
            <p className="text-xs font-bold uppercase">🥡 fiambreras disponibles</p>
            {available.map((l) => {
              const chosen = sourceEntry?.id === l.entry.id
              return (
                <button
                  key={l.entry.id}
                  onClick={() => {
                    setType('sobras')
                    setRecipeId(l.entry.recipe_id ?? '')
                    setSourceEntry(l.entry)
                  }}
                  className={`press-brutal flex items-baseline justify-between gap-2 border-2 border-ink px-2 py-1 text-left text-sm ${chosen ? 'bg-ink text-paper' : 'bg-white'}`}
                >
                  <span className="font-bold">{recipeName(l.entry.recipe_id) || 'comida sin receta'}</span>
                  <span className="shrink-0 text-xs" data-numeric>
                    {l.servings} rac. ·{' '}
                    {l.entry.frozen ? '🧊' : l.daysLeft === 0 ? 'caduca hoy' : `${l.daysLeft} días`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

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
