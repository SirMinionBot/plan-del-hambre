import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mondayOf, toISODate } from '../lib/dates'
import { lineGrams } from '../lib/macros'
import { useAuth } from '../hooks/useAuth'
import { useHousehold, accentBg } from '../hooks/useHousehold'
import { useWeekData } from '../hooks/useWeekData'
import { Button } from '../components/ui/Button'
import { Banner, EmptyState, Loading } from '../components/ui/Banner'
import type { ShoppingListItem } from '../types/db'

export function ShoppingPage() {
  const { session } = useAuth()
  const { household, me, partner } = useHousehold()
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const week = useWeekData(monday)
  const weekStart = toISODate(monday)
  const [listId, setListId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [categories, setCategories] = useState<Map<number, string>>(new Map())

  const loadList = useCallback(async () => {
    if (!household) return
    const { data: cats } = await supabase.from('ingredient_categories').select('id, name')
    setCategories(new Map((cats ?? []).map((c) => [c.id, c.name])))
    const { data: list } = await supabase
      .from('shopping_lists')
      .select('id')
      .eq('household_id', household.id)
      .eq('week_start', weekStart)
      .maybeSingle()
    setListId(list?.id ?? null)
    if (list) {
      const { data } = await supabase.from('shopping_list_items').select('*').eq('list_id', list.id).order('sort_order')
      setItems(data ?? [])
    } else {
      setItems([])
    }
    setLoadingList(false)
  }, [household, weekStart])

  useEffect(() => {
    setLoadingList(true)
    void loadList()
  }, [loadList])

  // checkboxes sincronizados entre los dos móviles
  useEffect(() => {
    if (!listId) return
    const channel = supabase
      .channel(`shopping-${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items', filter: `list_id=eq.${listId}` },
        () => void loadList(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [listId, loadList])

  /** Genera (o regenera preservando checks) la lista desde el plan semanal. */
  async function generate() {
    if (!household) return
    setNotice(null)

    // sin comidas planificadas no hay nada que agregar: avisar en vez de callar
    const plannable = week.entries.filter((e) => e.entry_type === 'normal' && e.recipe_id)
    if (plannable.length === 0) {
      setNotice(`La semana del ${weekStart} no tiene comidas planificadas. Ve al calendario y pulsa "Planificar semana" primero.`)
      return
    }
    setLoadingList(true)

    // agregación: por ingrediente+unidad, escalada a raciones reales; sobras no suman
    const acc = new Map<string, { ingredient_id: number; quantity: number; unit: string }>()
    for (const entry of week.entries) {
      if (entry.entry_type !== 'normal' || !entry.recipe_id) continue
      const recipe = week.recipesById.get(entry.recipe_id)
      if (!recipe) continue
      const portions = week.portions.filter((p) => p.entry_id === entry.id && !p.recipe_id)
      const servings = portions.reduce((a, p) => a + p.servings, 0) || 2
      const scale = servings / Math.max(recipe.servings, 1)
      for (const line of week.recipeIngredients.get(entry.recipe_id) ?? []) {
        const key = `${line.ingredient_id}|${line.unit}`
        const prev = acc.get(key)
        acc.set(key, {
          ingredient_id: line.ingredient_id,
          quantity: (prev?.quantity ?? 0) + line.quantity * scale,
          unit: line.unit,
        })
      }
    }

    const prevChecked = new Map(items.map((i) => [`${i.ingredient_id}|${i.unit}`, i.checked]))
    const pantryIds = new Set(
      (await supabase.from('pantry_items').select('ingredient_id').eq('household_id', household.id)).data
        ?.map((p) => p.ingredient_id)
        .filter(Boolean) ?? [],
    )

    let id = listId
    if (!id) {
      const { data } = await supabase
        .from('shopping_lists')
        .insert({ household_id: household.id, week_start: weekStart })
        .select('id')
        .single()
      id = data?.id ?? null
    }
    if (!id) return
    await supabase.from('shopping_list_items').delete().eq('list_id', id)

    const rows = [...acc.values()]
      .map((v, idx) => {
        const ing = week.ingredientsById.get(v.ingredient_id)
        return {
          list_id: id,
          ingredient_id: v.ingredient_id,
          name: ing?.name ?? String(v.ingredient_id),
          quantity: Math.round(v.quantity * 10) / 10,
          unit: v.unit,
          category: ing?.category_id ? (categories.get(ing.category_id) ?? null) : null,
          in_pantry: pantryIds.has(v.ingredient_id),
          checked: prevChecked.get(`${v.ingredient_id}|${v.unit}`) ?? false,
          sort_order: idx,
        }
      })
      .sort((a, b) => (a.category ?? 'zz').localeCompare(b.category ?? 'zz'))
    if (rows.length) await supabase.from('shopping_list_items').insert(rows)
    setListId(id)
    await loadList()
  }

  async function toggle(item: ShoppingListItem) {
    await supabase
      .from('shopping_list_items')
      .update({ checked: !item.checked, checked_by: !item.checked ? session!.user.id : null })
      .eq('id', item.id)
    void loadList()
  }

  const byCategory = useMemo(() => {
    const groups = new Map<string, ShoppingListItem[]>()
    for (const i of items) {
      const key = i.category ?? 'otros'
      groups.set(key, [...(groups.get(key) ?? []), i])
    }
    return [...groups.entries()]
  }, [items])

  const itemCost = useCallback(
    (item: ShoppingListItem): number | null => {
      if (!item.ingredient_id || item.quantity == null) return null
      const ing = week.ingredientsById.get(item.ingredient_id)
      if (!ing || ing.estimated_price_per_100g == null) return null
      const grams = lineGrams(
        { recipe_id: '', ingredient_id: item.ingredient_id, quantity: item.quantity, unit: item.unit ?? 'g' },
        ing,
      )
      return (grams / 100) * ing.estimated_price_per_100g
    },
    [week.ingredientsById],
  )

  const totalCost = items.reduce((a, i) => a + (itemCost(i) ?? 0), 0)

  if (week.loading || loadingList) return <Loading />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2>La compra</h2>
        <span className="font-bold uppercase" data-numeric>
          semana del {weekStart}
        </span>
        <Button onClick={() => setMonday(new Date(monday.getTime() - 7 * 86400000))}>←</Button>
        <Button onClick={() => setMonday(new Date(monday.getTime() + 7 * 86400000))}>→</Button>
        <span className="ml-auto">
          <Button variant="primary" onClick={generate}>
            {items.length ? 'Regenerar del plan' : 'Generar del plan'}
          </Button>
        </span>
      </div>

      {notice && <Banner variant="error">{notice}</Banner>}

      {totalCost > 0 && (
        <Banner variant="warn">
          Coste estimado: {totalCost.toFixed(2)} € — aproximado, para comparar semanas
        </Banner>
      )}

      {items.length === 0 ? (
        <EmptyState>
          <span>
            Sin lista. Primero{' '}
            <Link to="/planificar" className="underline">
              planifica la semana
            </Link>
            , después genera.
          </span>
        </EmptyState>
      ) : (
        byCategory.map(([category, rows]) => (
          <section key={category} className="border-brutal bg-white">
            <h3 className="border-b-2 border-ink bg-ink px-3 py-1 text-paper">{category}</h3>
            <ul>
              {rows.map((item) => {
                const checker = [me, partner].find((m) => m?.user_id === item.checked_by)
                return (
                  <li key={item.id} className="flex items-center gap-2 border-b-2 border-ink/20 px-3 py-2 last:border-0">
                    <button
                      onClick={() => toggle(item)}
                      className={`size-5 border-2 border-ink ${item.checked ? (checker ? accentBg[checker.accent] : 'bg-ink') : 'bg-white'}`}
                    />
                    <span className={`text-sm font-bold ${item.checked ? 'line-through opacity-40' : ''}`}>{item.name}</span>
                    {item.in_pantry && <span className="bg-warn px-1 text-xs font-bold uppercase">ya en despensa</span>}
                    <span className="ml-auto text-sm" data-numeric>
                      {item.quantity} {item.unit}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
