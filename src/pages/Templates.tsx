import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { mondayOf, toISODate, weekDates, addDays } from '../lib/dates'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Banner, Loading } from '../components/ui/Banner'
import { Tag } from '../components/ui/Tag'
import type { Recipe, WeekTemplate, WeekTemplateSlot } from '../types/db'

export function TemplatesPage() {
  const { household } = useHousehold()
  const [templates, setTemplates] = useState<WeekTemplate[] | null>(null)
  const [slots, setSlots] = useState<WeekTemplateSlot[]>([])
  const [sourceWeek, setSourceWeek] = useState(() => toISODate(mondayOf(new Date())))
  const [saveName, setSaveName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  // fetch puro (sin tocar estado) + apply en .then: evita setState síncrono en
  // el efecto y el setState tras desmontar
  const fetchAll = useCallback(async () => {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('week_templates').select('*').order('name'),
      supabase.from('week_template_slots').select('*'),
    ])
    return { t, s }
  }, [])

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchAll>>) => {
    setTemplates(d.t ?? [])
    setSlots(d.s ?? [])
  }, [])

  const load = useCallback(async () => apply(await fetchAll()), [apply, fetchAll])

  useEffect(() => {
    let cancelled = false
    void fetchAll().then((d) => {
      if (!cancelled) apply(d)
    })
    return () => {
      cancelled = true
    }
  }, [fetchAll, apply])

  /** Guarda una semana pasada como plantilla: etiquetas y tiempos de lo que se cocinó. */
  async function saveWeekAsTemplate(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const dates = weekDates(new Date(sourceWeek + 'T00:00:00'))
    const { data: entries } = await supabase
      .from('meal_entries')
      .select('*')
      .eq('household_id', household!.id)
      .in('date', dates)
      .not('recipe_id', 'is', null)
    if (!entries?.length) return setMessage('Esa semana no tiene nada planificado')

    const recipeIds = [...new Set(entries.map((e) => e.recipe_id!))]
    const { data: recipes } = await supabase.from('recipes').select('*').in('id', recipeIds)
    const byId = new Map((recipes ?? []).map((r) => [r.id, r as Recipe]))

    const { data: tpl, error } = await supabase
      .from('week_templates')
      .insert({ household_id: household!.id, name: saveName, description: `Derivada de la semana del ${sourceWeek}` })
      .select('id')
      .single()
    if (error || !tpl) return setMessage(error?.message ?? 'Error')

    const rows = entries
      .filter((e) => e.entry_type === 'normal')
      .map((e) => {
        const r = byId.get(e.recipe_id!)
        const weekday = dates.indexOf(e.date)
        return {
          template_id: tpl.id,
          weekday,
          meal_slot: e.meal_slot,
          required_tags: r?.tags.filter((t) => t !== 'batch') ?? [],
          excluded_tags: [],
          max_total_minutes: r ? r.prep_minutes + r.cook_minutes + 15 : null,
        }
      })
    if (rows.length) await supabase.from('week_template_slots').insert(rows)
    setSaveName('')
    setMessage('Plantilla guardada')
    void load()
  }

  /** Duplica una semana pasada sobre la semana siguiente (slots vacíos solamente). */
  async function duplicateWeek() {
    setMessage(null)
    const dates = weekDates(new Date(sourceWeek + 'T00:00:00'))
    const targetMonday = toISODate(mondayOf(new Date(addDays(toISODate(mondayOf(new Date())), 7) + 'T00:00:00')))
    const targetDates = weekDates(new Date(targetMonday + 'T00:00:00'))

    const [{ data: source }, { data: existing }] = await Promise.all([
      supabase.from('meal_entries').select('*').eq('household_id', household!.id).in('date', dates),
      supabase.from('meal_entries').select('date, meal_slot').eq('household_id', household!.id).in('date', targetDates),
    ])
    if (!source?.length) return setMessage('Esa semana está vacía')
    const taken = new Set((existing ?? []).map((e) => `${e.date}|${e.meal_slot}`))

    let copied = 0
    for (const e of source) {
      const target = targetDates[dates.indexOf(e.date)]
      if (taken.has(`${target}|${e.meal_slot}`)) continue
      const { data: entry } = await supabase
        .from('meal_entries')
        .insert({
          household_id: household!.id,
          date: target,
          meal_slot: e.meal_slot,
          entry_type: e.entry_type,
          recipe_id: e.recipe_id,
          cook_user_id: e.cook_user_id,
          notes: e.notes,
        })
        .select('id')
        .single()
      if (entry) {
        const { data: portions } = await supabase.from('meal_entry_portions').select('*').eq('entry_id', e.id)
        if (portions?.length) {
          await supabase
            .from('meal_entry_portions')
            .insert(portions.map((p) => ({ ...p, entry_id: entry.id })))
        }
        copied++
      }
    }
    setMessage(`${copied} slots copiados a la semana del ${targetMonday}`)
  }

  async function removeTemplate(id: string) {
    await supabase.from('week_templates').delete().eq('id', id)
    void load()
  }

  if (!templates) return <Loading />

  return (
    <div className="flex flex-col gap-4">
      <h2>Plantillas de semana</h2>
      <p className="text-xs font-bold uppercase opacity-60">
        Imponen restricciones por hueco al planificar. Se eligen en la pantalla de planificación.
      </p>

      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const n = slots.filter((s) => s.template_id === t.id).length
          return (
            <li key={t.id} className="border-brutal shadow-brutal flex flex-col gap-2 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3>{t.name}</h3>
                {t.household_id ? (
                  <button onClick={() => removeTemplate(t.id)} className="border-2 border-ink px-2 text-xs font-bold">
                    BORRAR
                  </button>
                ) : (
                  <Tag>de serie</Tag>
                )}
              </div>
              <p className="text-sm">{t.description}</p>
              <p className="text-xs font-bold uppercase opacity-60" data-numeric>
                {n} huecos con restricciones
              </p>
            </li>
          )
        })}
      </ul>

      <section className="border-brutal shadow-brutal flex flex-col gap-3 bg-white p-4">
        <h3>Reaprovechar una semana</h3>
        <div className="flex flex-wrap items-end gap-2">
          <Input label="Lunes de la semana origen" type="date" value={sourceWeek} onChange={(e) => setSourceWeek(e.target.value)} className="max-w-44" />
          <Button onClick={duplicateWeek}>Duplicar a la semana que viene</Button>
        </div>
        <form onSubmit={saveWeekAsTemplate} className="flex flex-wrap items-end gap-2">
          <Input label="Guardar como plantilla" placeholder="nombre" value={saveName} onChange={(e) => setSaveName(e.target.value)} required className="max-w-56" />
          <Button variant="primary" type="submit">
            Guardar plantilla
          </Button>
        </form>
        {message && <Banner variant="warn">{message}</Banner>}
      </section>
    </div>
  )
}
