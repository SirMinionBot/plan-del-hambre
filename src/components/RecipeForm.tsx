import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useHousehold } from '../hooks/useHousehold'
import { Button } from './ui/Button'
import { Input, Select, Textarea } from './ui/Field'
import { Banner } from './ui/Banner'
import { Picker, type PickerItem } from './ui/Picker'
import type { Ingredient, Recipe, RecipeIngredient, SeasonTag } from '../types/db'

const ALL_TAGS = ['desayuno', 'rapida', 'sin-horno', 'horno', 'veggie', 'ensalada', 'guiso', 'fiambrera', 'batch', 'dulce']
const SEASONS: SeasonTag[] = ['todo-el-ano', 'primavera', 'verano', 'otono', 'invierno']
const UNITS = ['g', 'ml', 'pieza', 'cdta', 'cda']

interface LineDraft {
  name: string
  quantity: string
  unit: string
}

export function RecipeForm({
  recipe,
  lines,
  ingredients,
  onDone,
}: {
  recipe: Recipe | null
  lines: RecipeIngredient[]
  ingredients: Ingredient[]
  onDone: (savedId: string | null) => void
}) {
  const { session } = useAuth()
  const { household } = useHousehold()
  const byId = new Map(ingredients.map((i) => [i.id, i]))

  const [form, setForm] = useState({
    name: recipe?.name ?? '',
    description: recipe?.description ?? '',
    instructions: recipe?.instructions ?? '',
    servings: recipe?.servings ?? 2,
    prep_minutes: recipe?.prep_minutes ?? 10,
    cook_minutes: recipe?.cook_minutes ?? 20,
    season: recipe?.season ?? ('todo-el-ano' as SeasonTag),
    batch_days: recipe?.batch_days ?? 1,
    main_ingredient: recipe?.main_ingredient ?? '',
  })
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? [])
  const [draft, setDraft] = useState<LineDraft[]>(
    lines.length
      ? lines.map((l) => ({ name: byId.get(l.ingredient_id)?.name ?? '', quantity: String(l.quantity), unit: l.unit }))
      : [{ name: '', quantity: '', unit: 'g' }],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ingredientItems: PickerItem[] = ingredients.map((i) => ({
    id: String(i.id),
    label: i.name,
    sublabel: i.default_unit,
  }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const resolved: { ingredient_id: number; quantity: number; unit: string }[] = []
    for (const l of draft) {
      if (!l.name.trim()) continue
      const ing = ingredients.find((i) => i.name === l.name.trim().toLowerCase())
      if (!ing) return fail(`Ingrediente desconocido: ${l.name}`)
      resolved.push({ ingredient_id: ing.id, quantity: Number(l.quantity) || 0, unit: l.unit })
    }
    if (resolved.length === 0) return fail('Añade al menos un ingrediente')

    const payload = {
      ...form,
      main_ingredient: form.main_ingredient || null,
      description: form.description || null,
      instructions: form.instructions || null,
      tags,
      household_id: recipe?.household_id ?? household!.id,
      created_by: recipe?.created_by ?? session!.user.id,
    }

    let savedId = recipe?.id
    if (savedId) {
      const { error } = await supabase.from('recipes').update(payload).eq('id', savedId)
      if (error) return fail(error.message)
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', savedId)
    } else {
      const { data, error } = await supabase.from('recipes').insert(payload).select('id').single()
      if (error || !data) return fail(error?.message ?? 'Error al crear')
      savedId = data.id
    }
    const { error: lErr } = await supabase
      .from('recipe_ingredients')
      .insert(resolved.map((r) => ({ ...r, recipe_id: savedId! })))
    if (lErr) return fail(lErr.message)
    onDone(savedId!)
  }

  function fail(message: string) {
    setError(message)
    setBusy(false)
    return undefined
  }

  return (
    <form onSubmit={save} className="border-brutal shadow-brutal flex flex-col gap-4 bg-white p-6">
      <h2>{recipe ? 'Editar receta' : 'Nueva receta del hogar'}</h2>

      <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Input label="Raciones" type="number" min={1} value={form.servings} onChange={(e) => setForm({ ...form, servings: Number(e.target.value) })} />
        <Input label="Prep min" type="number" min={0} value={form.prep_minutes} onChange={(e) => setForm({ ...form, prep_minutes: Number(e.target.value) })} />
        <Input label="Cocina min" type="number" min={0} value={form.cook_minutes} onChange={(e) => setForm({ ...form, cook_minutes: Number(e.target.value) })} />
        <Select label="Temporada" value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value as SeasonTag })}>
          {SEASONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Input label="Rinde días" type="number" min={1} max={4} value={form.batch_days} onChange={(e) => setForm({ ...form, batch_days: Number(e.target.value) })} />
      </div>

      <fieldset className="border-brutal-thin p-3">
        <legend className="px-1 text-xs font-bold uppercase">Etiquetas</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
              className={`border-2 border-ink px-2 py-0.5 text-xs font-bold uppercase ${tags.includes(t) ? 'bg-ink text-paper' : 'bg-white'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-brutal-thin flex flex-col gap-2 p-3">
        <legend className="px-1 text-xs font-bold uppercase">Ingredientes (cantidades totales)</legend>
        {draft.map((l, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_5rem_5rem_2.5rem] gap-2">
            <Picker
              value={l.name}
              placeholder="ingrediente..."
              items={ingredientItems}
              onSelect={(id) => {
                const ing = ingredients.find((x) => String(x.id) === id)
                setDraft(
                  draft.map((x, i) =>
                    i === idx ? { ...x, name: ing?.name ?? '', unit: ing?.default_unit ?? x.unit } : x,
                  ),
                )
              }}
            />
            <Input type="number" step="any" min={0} value={l.quantity} placeholder="cant." onChange={(e) => setDraft(draft.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
            <Select value={l.unit} onChange={(e) => setDraft(draft.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
            <Button type="button" onClick={() => setDraft(draft.filter((_, i) => i !== idx))}>
              ✕
            </Button>
          </div>
        ))}
        <Button type="button" onClick={() => setDraft([...draft, { name: '', quantity: '', unit: 'g' }])}>
          + ingrediente
        </Button>
      </fieldset>

      <Textarea
        label="Preparación (un paso por línea)"
        rows={5}
        value={form.instructions}
        onChange={(e) => setForm({ ...form, instructions: e.target.value })}
      />
      <Input
        label="Ingrediente principal (para variedad del planificador)"
        value={form.main_ingredient}
        onChange={(e) => setForm({ ...form, main_ingredient: e.target.value })}
        placeholder="pollo, pasta, legumbre..."
      />

      {error && <Banner variant="error">{error}</Banner>}

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => onDone(null)} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
