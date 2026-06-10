import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Picker } from '../components/ui/Picker'
import { EmptyState, Loading } from '../components/ui/Banner'
import type { Ingredient, PantryItem } from '../types/db'

function daysLeft(expiresOn: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(expiresOn + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

export function PantryPage() {
  const { household } = useHousehold()
  const [items, setItems] = useState<PantryItem[] | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [name, setName] = useState('')
  const [expires, setExpires] = useState('')

  const load = useCallback(async () => {
    if (!household) return
    const [{ data: p }, { data: ing }] = await Promise.all([
      supabase.from('pantry_items').select('*').eq('household_id', household.id).order('expires_on', { nullsFirst: false }),
      supabase.from('ingredients').select('*').order('name'),
    ])
    setItems(p ?? [])
    setIngredients(ing ?? [])
  }, [household])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const ing = ingredients.find((i) => i.name === name.trim().toLowerCase())
    await supabase.from('pantry_items').insert({
      household_id: household!.id,
      name: name.trim(),
      ingredient_id: ing?.id ?? null,
      expires_on: expires || null,
    })
    setName('')
    setExpires('')
    void load()
  }

  async function remove(id: string) {
    await supabase.from('pantry_items').delete().eq('id', id)
    void load()
  }

  if (!items) return <Loading />

  return (
    <div className="flex flex-col gap-4">
      <h2>Despensa</h2>
      <p className="text-xs font-bold uppercase opacity-60">
        Solo qué hay y cuándo muere — sin cantidades. El planificador prioriza lo que caduca.
      </p>

      <form onSubmit={add} className="border-brutal shadow-brutal flex flex-wrap items-end gap-2 bg-white p-4">
        <div className="w-full max-w-56">
          <Picker
            label="Qué"
            value={name}
            placeholder="elegir o escribir..."
            items={ingredients.map((i) => ({ id: String(i.id), label: i.name }))}
            onSelect={(id) => setName(ingredients.find((i) => String(i.id) === id)?.name ?? '')}
            onFreeText={(text) => setName(text)}
          />
        </div>
        <Input label="Caduca" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="max-w-44" />
        <Button variant="primary" type="submit" disabled={!name}>
          Añadir
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState>Despensa vacía</EmptyState>
      ) : (
        <ul className="border-brutal bg-white">
          {items.map((item) => {
            const days = item.expires_on ? daysLeft(item.expires_on) : null
            const urgent = days !== null && days <= 2
            return (
              <li key={item.id} className="flex items-center gap-3 border-b-2 border-ink/20 px-3 py-2 last:border-0">
                <span className="font-bold">{item.name}</span>
                {item.ingredient_id === null && (
                  <span className="text-xs uppercase opacity-50" title="sin vincular al catálogo">
                    libre
                  </span>
                )}
                {days !== null && (
                  <span
                    className={`px-1 text-xs font-bold uppercase ${urgent ? 'bg-ink text-paper' : days <= 5 ? 'bg-warn' : ''}`}
                    data-numeric
                  >
                    {days < 0 ? 'CADUCADO' : days === 0 ? 'HOY' : `${days} días`}
                  </span>
                )}
                <button onClick={() => remove(item.id)} className="ml-auto border-2 border-ink bg-white px-2 text-xs font-bold">
                  GASTADO ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
