import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mondayOf, dayLabel, toISODate } from '../lib/dates'
import { macrosPerServing } from '../lib/macros'
import { useHousehold, accentBg } from '../hooks/useHousehold'
import { useWeekData } from '../hooks/useWeekData'
import { Button } from '../components/ui/Button'
import { Loading } from '../components/ui/Banner'
import { QuickRating } from '../components/QuickRating'
import { SlotEditor } from '../components/SlotEditor'
import type { MealEntry, MealSlot } from '../types/db'

const SLOTS: MealSlot[] = ['desayuno', 'comida', 'cena']

export function CalendarPage() {
  const { me, partner } = useHousehold()
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const week = useWeekData(monday)
  const [editing, setEditing] = useState<{ date: string; slot: MealSlot } | null>(null)
  const [rating, setRating] = useState<{ id: string; name: string } | null>(null)

  const entryAt = (date: string, slot: MealSlot) =>
    week.entries.find((e) => e.date === date && e.meal_slot === slot)

  // balance semanal de cocinados por persona
  const cookBalance = useMemo(() => {
    const count: Record<string, number> = {}
    for (const e of week.entries) if (e.cook_user_id) count[e.cook_user_id] = (count[e.cook_user_id] ?? 0) + 1
    return count
  }, [week.entries])

  // kcal por persona y día según raciones individuales
  const dayCalories = (date: string, userId: string) => {
    let kcal = 0
    for (const e of week.entries.filter((e) => e.date === date)) {
      const portion = week.portions.find((p) => p.entry_id === e.id && p.user_id === userId)
      const recipeId = portion?.recipe_id ?? e.recipe_id
      if (!recipeId || !portion) continue
      const recipe = week.recipesById.get(recipeId)
      if (!recipe) continue
      const m = macrosPerServing(recipe, week.recipeIngredients.get(recipeId) ?? [], week.ingredientsById)
      kcal += m.calories * portion.servings
    }
    return Math.round(kcal)
  }

  async function markCooked(entry: MealEntry) {
    const marking = !entry.cooked_at
    await supabase
      .from('meal_entries')
      .update({ cooked_at: marking ? new Date().toISOString() : null })
      .eq('id', entry.id)
    await week.reload()
    if (marking && entry.recipe_id) {
      const recipe = week.recipesById.get(entry.recipe_id)
      if (recipe) setRating({ id: recipe.id, name: recipe.name })
    }
  }

  if (week.loading) return <Loading />

  const members = [me, partner].filter(Boolean)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button onClick={() => setMonday(new Date(monday.getTime() - 7 * 86400000))}>←</Button>
          <Button onClick={() => setMonday(mondayOf(new Date()))}>Hoy</Button>
          <Button onClick={() => setMonday(new Date(monday.getTime() + 7 * 86400000))}>→</Button>
        </div>
        <p className="font-bold uppercase" data-numeric>
          Semana del {toISODate(monday)}
        </p>
        <div className="flex items-center gap-3">
          {members.map((m) => (
            <span key={m!.user_id} className="flex items-center gap-1 text-sm font-bold" data-numeric>
              <span className={`inline-block size-3 border-2 border-ink ${accentBg[m!.accent]}`} />
              {cookBalance[m!.user_id] ?? 0}
            </span>
          ))}
          <span className="text-xs font-bold uppercase opacity-60">cocinados</span>
        </div>
        <Link to="/planificar">
          <Button variant="primary">Planificar semana</Button>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border-4 border-ink bg-white">
          <thead>
            <tr>
              <th className="border-2 border-ink bg-ink p-2 text-paper" />
              {week.dates.map((d) => (
                <th key={d} className="border-2 border-ink bg-ink p-2 text-xs text-paper" data-numeric>
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot}>
                <th className="border-2 border-ink p-2 text-left text-xs uppercase">{slot}</th>
                {week.dates.map((date) => {
                  const entry = entryAt(date, slot)
                  return (
                    <td
                      key={date}
                      onClick={() => setEditing({ date, slot })}
                      className="h-20 min-w-28 cursor-pointer border-2 border-ink p-1 align-top text-xs hover:bg-warn/30"
                    >
                      {entry && (
                        <CellContent
                          entry={entry}
                          week={week}
                          onCooked={(e) => {
                            void markCooked(e)
                          }}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th className="border-2 border-ink p-2 text-left text-xs uppercase">kcal</th>
              {week.dates.map((date) => (
                <td key={date} className="border-2 border-ink p-1 text-center text-xs font-bold" data-numeric>
                  {members.map((m) => (
                    <div key={m!.user_id} className="flex items-center justify-center gap-1">
                      <span className={`inline-block size-2 ${accentBg[m!.accent]}`} />
                      {dayCalories(date, m!.user_id)}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {editing && (
        <SlotEditor
          date={editing.date}
          slot={editing.slot}
          entry={entryAt(editing.date, editing.slot) ?? null}
          week={week}
          onClose={(changed) => {
            setEditing(null)
            if (changed) void week.reload()
          }}
        />
      )}
      {rating && <QuickRating recipeId={rating.id} recipeName={rating.name} onClose={() => setRating(null)} />}
      <p className="text-xs font-bold uppercase opacity-60">
        Click en una celda para editar · siguiente semana con → · sobras se colocan solas al planificar
      </p>
    </div>
  )
}

function CellContent({
  entry,
  week,
  onCooked,
}: {
  entry: MealEntry
  week: ReturnType<typeof useWeekData>
  onCooked: (e: MealEntry) => void
}) {
  const { me, partner } = useHousehold()
  const recipe = entry.recipe_id ? week.recipesById.get(entry.recipe_id) : null

  if (entry.entry_type === 'fuera' || entry.entry_type === 'cheat' || entry.entry_type === 'evento') {
    return <p className="bg-ink p-1 text-center font-bold uppercase text-paper">{entry.entry_type}</p>
  }

  const cook = [me, partner].find((m) => m?.user_id === entry.cook_user_id)
  const divergent = week.portions.filter((p) => p.entry_id === entry.id && p.recipe_id)

  return (
    <div className="flex h-full flex-col gap-1">
      <p className="font-bold">
        {entry.pinned && '📌 '}
        {entry.entry_type === 'sobras' && <span className="bg-warn px-1">SOBRAS </span>}
        {recipe?.name ?? '—'}
      </p>
      {divergent.map((p) => {
        const m = [me, partner].find((x) => x?.user_id === p.user_id)
        const r = p.recipe_id ? week.recipesById.get(p.recipe_id) : null
        return (
          <p key={p.user_id} className="flex items-center gap-1">
            <span className={`inline-block size-2 ${m ? accentBg[m.accent] : ''}`} />
            {r?.name}
          </p>
        )
      })}
      <div className="mt-auto flex items-center justify-between">
        {cook ? <span className={`size-3 border-2 border-ink ${accentBg[cook.accent]}`} title="cocina" /> : <span />}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCooked(entry)
          }}
          className={`border-2 border-ink px-1 font-bold ${entry.cooked_at ? 'bg-ok text-white' : 'bg-white'}`}
          title="marcar cocinada"
        >
          ✓
        </button>
      </div>
    </div>
  )
}
