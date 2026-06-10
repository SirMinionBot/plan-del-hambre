import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { mondayOf, toISODate, addDays } from '../lib/dates'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Picker } from '../components/ui/Picker'
import { Banner, EmptyState, Loading } from '../components/ui/Banner'
import type { Ingredient, PantryItem } from '../types/db'

interface TicketItem {
  name: string
  perishable: boolean
  days_to_expiry_guess: number | null
}

interface TicketResult {
  items: TicketItem[]
  total: number | null
}

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
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<{ result: TicketResult; selected: Record<number, string | null> } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  /** Foto del ticket → Claude extrae productos y total → confirmación. */
  async function scanTicket(file: File) {
    setScanning(true)
    setScanError(null)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const { data, error } = await supabase.functions.invoke('parse-ticket', {
        body: { image: base64, media_type: file.type || 'image/jpeg' },
      })
      if (error) throw new Error(error.message)
      const result = data as TicketResult
      // preselecciona perecederos con su caducidad estimada
      const selected: Record<number, string | null> = {}
      result.items.forEach((item, i) => {
        if (item.perishable) {
          selected[i] = item.days_to_expiry_guess ? addDays(toISODate(new Date()), item.days_to_expiry_guess) : null
        }
      })
      setTicket({ result, selected })
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Error al escanear')
    }
    setScanning(false)
  }

  async function confirmTicket() {
    if (!ticket) return
    const rows = Object.entries(ticket.selected).map(([idx, expiresOn]) => {
      const item = ticket.result.items[Number(idx)]
      const ing = ingredients.find((i) => i.name === item.name.toLowerCase())
      return {
        household_id: household!.id,
        name: item.name.toLowerCase(),
        ingredient_id: ing?.id ?? null,
        expires_on: expiresOn,
      }
    })
    if (rows.length) await supabase.from('pantry_items').insert(rows)
    // coste real de la semana actual
    if (ticket.result.total != null) {
      const weekStart = toISODate(mondayOf(new Date()))
      await supabase
        .from('shopping_lists')
        .upsert({ household_id: household!.id, week_start: weekStart, actual_cost: ticket.result.total }, { onConflict: 'household_id,week_start' })
    }
    setTicket(null)
    void load()
  }

  if (!items) return <Loading />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Despensa</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void scanTicket(f)
            e.target.value = ''
          }}
        />
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={scanning}>
          {scanning ? 'Leyendo ticket...' : '📷 Escanear ticket'}
        </Button>
      </div>
      <p className="text-xs font-bold uppercase opacity-60">
        Solo qué hay y cuándo muere — sin cantidades. El planificador prioriza lo que caduca.
      </p>
      {scanError && <Banner variant="error">{scanError}</Banner>}

      {ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={() => setTicket(null)}>
          <div
            className="border-brutal shadow-brutal-lg flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto bg-paper p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Del ticket a la despensa</h2>
            {ticket.result.total != null && (
              <Banner variant="warn">Total del ticket: {ticket.result.total.toFixed(2)} € — se guarda como coste real de la semana</Banner>
            )}
            <ul className="flex flex-col gap-2">
              {ticket.result.items.map((item, i) => {
                const checked = i in ticket.selected
                return (
                  <li key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const selected = { ...ticket.selected }
                        if (checked) delete selected[i]
                        else selected[i] = item.days_to_expiry_guess ? addDays(toISODate(new Date()), item.days_to_expiry_guess) : null
                        setTicket({ ...ticket, selected })
                      }}
                      className={`size-5 shrink-0 border-2 border-ink ${checked ? 'bg-ink' : 'bg-white'}`}
                    />
                    <span className="flex-1 text-sm font-bold">{item.name}</span>
                    {checked && (
                      <Input
                        type="date"
                        value={ticket.selected[i] ?? ''}
                        onChange={(e) =>
                          setTicket({ ...ticket, selected: { ...ticket.selected, [i]: e.target.value || null } })
                        }
                        className="max-w-36"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setTicket(null)}>Cancelar</Button>
              <Button variant="primary" onClick={confirmTicket}>
                Añadir {Object.keys(ticket.selected).length} a despensa
              </Button>
            </div>
          </div>
        </div>
      )}

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
