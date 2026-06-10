import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { pushSupported, getCurrentSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import { Picker } from '../components/ui/Picker'
import { useAuth } from '../hooks/useAuth'
import { useHousehold } from '../hooks/useHousehold'
import { PersonMark } from '../components/ui/Tag'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Banner } from '../components/ui/Banner'
import type { Ingredient, UserExcludedIngredient } from '../types/db'

function ExcludedIngredients() {
  const { session } = useAuth()
  const uid = session!.user.id
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [excluded, setExcluded] = useState<UserExcludedIngredient[]>([])

  async function load() {
    const [{ data: ing }, { data: exc }] = await Promise.all([
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('user_excluded_ingredients').select('*').eq('user_id', uid),
    ])
    setIngredients(ing ?? [])
    setExcluded(exc ?? [])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  async function add(ingredientId: number) {
    await supabase.from('user_excluded_ingredients').insert({ user_id: uid, ingredient_id: ingredientId })
    void load()
  }

  async function remove(id: number) {
    await supabase.from('user_excluded_ingredients').delete().eq('user_id', uid).eq('ingredient_id', id)
    void load()
  }

  return (
    <section className="border-brutal shadow-brutal flex flex-col gap-3 bg-white p-6">
      <h2>Esto no como</h2>
      <p className="text-sm">Alergias y manías. Ninguna receta con estos ingredientes será sugerida.</p>
      <Picker
        value=""
        placeholder="vetar ingrediente..."
        items={ingredients
          .filter((i) => !excluded.some((e) => e.ingredient_id === i.id))
          .map((i) => ({ id: String(i.id), label: i.name }))}
        onSelect={(id) => {
          if (id) void add(Number(id))
        }}
      />
      <ul className="flex flex-wrap gap-2">
        {excluded.map((e) => {
          const ing = ingredients.find((i) => i.id === e.ingredient_id)
          return (
            <li key={e.ingredient_id}>
              <button
                onClick={() => remove(e.ingredient_id)}
                className="border-2 border-ink bg-ink px-2 py-0.5 text-xs font-bold uppercase text-paper"
                title="Quitar"
              >
                {ing?.name ?? e.ingredient_id} ✕
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PushSettings() {
  const { session } = useAuth()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const supported = pushSupported()

  useEffect(() => {
    if (!supported) return
    getCurrentSubscription().then((s) => setSubscribed(Boolean(s)))
  }, [supported])

  async function toggle() {
    if (subscribed) {
      await unsubscribeFromPush()
      setSubscribed(false)
    } else {
      setSubscribed(await subscribeToPush(session!.user.id))
    }
  }

  return (
    <section className="border-brutal shadow-brutal flex flex-col gap-3 bg-white p-6">
      <h2>Avisos</h2>
      <p className="text-sm">
        Push el domingo si la semana siguiente está sin planificar, y cuando algo de la despensa esté a punto de
        caducar. Si lo deniegas, los avisos siguen saliendo como banners al abrir la app.
      </p>
      {!supported ? (
        <p className="text-xs font-bold uppercase opacity-60">
          Sin soporte push en este navegador o falta VITE_VAPID_PUBLIC_KEY — quedan los banners in-app
        </p>
      ) : (
        <Button variant={subscribed ? 'default' : 'primary'} onClick={toggle} disabled={subscribed === null}>
          {subscribed ? 'Desactivar push en este dispositivo' : 'Activar push en este dispositivo'}
        </Button>
      )}
    </section>
  )
}

export function ProfilePage() {
  const { session } = useAuth()
  const { household, me, partner, refresh } = useHousehold()
  const [form, setForm] = useState({ display_name: '', daily_calorie_goal: 2000, protein_goal_g: '', carbs_goal_g: '', fat_goal_g: '' })
  const [budget, setBudget] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setBudget(household?.weekly_budget?.toString() ?? '')
  }, [household])

  useEffect(() => {
    if (!me) return
    setForm({
      display_name: me.profile.display_name,
      daily_calorie_goal: me.profile.daily_calorie_goal,
      protein_goal_g: me.profile.protein_goal_g?.toString() ?? '',
      carbs_goal_g: me.profile.carbs_goal_g?.toString() ?? '',
      fat_goal_g: me.profile.fat_goal_g?.toString() ?? '',
    })
  }, [me])

  async function save(e: FormEvent) {
    e.preventDefault()
    await supabase
      .from('profiles')
      .update({
        display_name: form.display_name,
        daily_calorie_goal: form.daily_calorie_goal,
        protein_goal_g: form.protein_goal_g ? Number(form.protein_goal_g) : null,
        carbs_goal_g: form.carbs_goal_g ? Number(form.carbs_goal_g) : null,
        fat_goal_g: form.fat_goal_g ? Number(form.fat_goal_g) : null,
      })
      .eq('id', session!.user.id)
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="border-brutal shadow-brutal flex flex-col gap-2 bg-white p-6">
        <h2>{household?.name}</h2>
        <p className="font-bold uppercase">
          Código de invitación: <span className="bg-warn px-2" data-numeric>{household?.invite_code}</span>
        </p>
        <div className="flex gap-6">
          {me && <PersonMark accent={me.accent} label={`${me.profile.display_name} (tú)`} />}
          {partner ? (
            <PersonMark accent={partner.accent} label={partner.profile.display_name} />
          ) : (
            <span className="text-xs font-bold uppercase opacity-60">Esperando a tu pareja...</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Input
            label="Presupuesto semanal € (vacío = sin límite)"
            type="number"
            step="1"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="max-w-44"
          />
          <Button
            onClick={async () => {
              await supabase
                .from('households')
                .update({ weekly_budget: budget ? Number(budget) : null })
                .eq('id', household!.id)
              await refresh()
            }}
          >
            Guardar presupuesto
          </Button>
        </div>
        <p className="text-xs font-bold uppercase opacity-60" data-numeric>
          Telegram: vincula el bot enviándole <span className="bg-warn px-1 normal-case">/start {me?.profile.telegram_link_code}</span>
        </p>
      </section>

      <form onSubmit={save} className="border-brutal shadow-brutal flex flex-col gap-4 bg-white p-6">
        <h2>Tus objetivos</h2>
        <Input label="Nombre" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input
            label="Kcal/día"
            type="number"
            value={form.daily_calorie_goal}
            onChange={(e) => setForm({ ...form, daily_calorie_goal: Number(e.target.value) })}
          />
          <Input label="Proteína g" type="number" value={form.protein_goal_g} onChange={(e) => setForm({ ...form, protein_goal_g: e.target.value })} />
          <Input label="Carbos g" type="number" value={form.carbs_goal_g} onChange={(e) => setForm({ ...form, carbs_goal_g: e.target.value })} />
          <Input label="Grasa g" type="number" value={form.fat_goal_g} onChange={(e) => setForm({ ...form, fat_goal_g: e.target.value })} />
        </div>
        {saved && <Banner variant="ok">Guardado</Banner>}
        <Button variant="primary" type="submit">
          Guardar
        </Button>
        <Link to="/calibrar" className="text-center text-xs font-bold uppercase underline">
          Calibrar mis gustos (2 min) →
        </Link>
      </form>

      <ExcludedIngredients />

      <PushSettings />

      <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </Button>
    </div>
  )
}
