import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { addDays, mondayOf, toISODate } from '../lib/dates'
import { macrosPerServing } from '../lib/macros'
import { availableLeftovers, suggestFreeze, type AvailableLeftover } from '../lib/leftovers'
import { useAuth } from '../hooks/useAuth'
import { useHousehold, accentBg, accentText } from '../hooks/useHousehold'
import { useWeekData } from '../hooks/useWeekData'
import { Button } from '../components/ui/Button'
import { Banner, Loading } from '../components/ui/Banner'
import { QuickRating } from '../components/QuickRating'
import { RecipeImage } from '../components/ui/RecipeImage'
import type { MealEntry, MealSlot, Recipe, RecipeIngredient } from '../types/db'

const SLOTS: MealSlot[] = ['desayuno', 'comida', 'cena']

type Week = ReturnType<typeof useWeekData>

/** retraso de la entrada en cascada (anim-rise) */
const stagger = (n: number) => ({ '--stagger': n }) as CSSProperties

/** slot "vigente" según la hora: desayuno hasta las 11:30, comida hasta las 16:30 */
function slotAhora(): MealSlot {
  const h = new Date().getHours() + new Date().getMinutes() / 60
  if (h < 11.5) return 'desayuno'
  if (h < 16.5) return 'comida'
  return 'cena'
}

/** count-up con rAF; salta directo al valor con prefers-reduced-motion */
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const origin = from.current
    from.current = target
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - start) / duration)
      setValue(Math.round(origin + (target - origin) * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function kcalPorRacion(recipeId: string | null | undefined, week: Week): number | null {
  if (!recipeId) return null
  const r = week.recipesById.get(recipeId)
  if (!r) return null
  return Math.round(
    macrosPerServing(r, week.recipeIngredients.get(recipeId) ?? [], week.ingredientsById).calories,
  )
}

export function TodayPage() {
  const { session } = useAuth()
  const { me, partner, household } = useHousehold()
  const [monday] = useState(() => mondayOf(new Date()))
  const week = useWeekData(monday)
  const today = toISODate(new Date())
  const [rating, setRating] = useState<{ id: string; name: string } | null>(null)
  const [myRatingsCount, setMyRatingsCount] = useState<number | null>(null)
  const [fiambreras, setFiambreras] = useState<{
    items: AvailableLeftover[]
    recipesById: Map<string, Recipe>
    linesByRecipe: Map<string, RecipeIngredient[]>
  } | null>(null)

  const members = [me, partner].filter(Boolean)

  // sobras disponibles: las cocinadas estos días pueden venir de la semana
  // pasada, así que se consultan aparte del rango de useWeekData
  useEffect(() => {
    if (!household) return
    let cancelled = false
    void (async () => {
      const { data: entries } = await supabase
        .from('meal_entries')
        .select('*')
        .eq('household_id', household.id)
        .gt('leftover_servings', 0)
        .not('cooked_at', 'is', null)
        .gte('date', addDays(today, -10))
      const items = availableLeftovers(entries ?? [], today)
      const recipeIds = [...new Set(items.map((l) => l.entry.recipe_id).filter(Boolean) as string[])]
      const [{ data: recipes }, { data: lines }] = await Promise.all([
        recipeIds.length
          ? supabase.from('recipes').select('*').in('id', recipeIds)
          : Promise.resolve({ data: [] as Recipe[] }),
        recipeIds.length
          ? supabase.from('recipe_ingredients').select('*').in('recipe_id', recipeIds)
          : Promise.resolve({ data: [] as RecipeIngredient[] }),
      ])
      if (cancelled) return
      const linesByRecipe = new Map<string, RecipeIngredient[]>()
      for (const l of lines ?? []) {
        const arr = linesByRecipe.get(l.recipe_id) ?? []
        arr.push(l)
        linesByRecipe.set(l.recipe_id, arr)
      }
      setFiambreras({ items, recipesById: new Map((recipes ?? []).map((r) => [r.id, r])), linesByRecipe })
    })()
    return () => {
      cancelled = true
    }
  }, [household, today, week.entries])

  useEffect(() => {
    if (!session) return
    supabase
      .from('recipe_ratings')
      .select('recipe_id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .then(({ count }) => setMyRatingsCount(count ?? 0))
  }, [session])

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

  async function updateLeftover(entry: MealEntry, patch: { leftover_servings?: number; frozen?: boolean }) {
    await supabase.from('meal_entries').update(patch).eq('id', entry.id)
    await week.reload()
  }

  if (week.loading) return <Loading />

  const todayEntries = week.entries.filter((e) => e.date === today)
  const weekEmpty = week.entries.length === 0

  // pieza destacada: la primera comida sin cocinar desde el slot vigente;
  // si todo lo de hoy está hecho, se queda la del slot vigente (estado "✓")
  const desde = SLOTS.indexOf(slotAhora())
  const porSlot = (s: MealSlot) => todayEntries.find((e) => e.meal_slot === s)
  const featured =
    SLOTS.slice(desde).map(porSlot).find((e) => e && !e.cooked_at) ??
    SLOTS.map(porSlot).find((e) => e && !e.cooked_at) ??
    porSlot(slotAhora()) ??
    todayEntries[0] ??
    null

  const memberKcal = (userId: string) => {
    let kcal = 0
    for (const e of todayEntries) {
      const p = week.portions.find((p) => p.entry_id === e.id && p.user_id === userId)
      const recipeId = p?.recipe_id ?? e.recipe_id
      if (!recipeId || !p) continue
      const r = week.recipesById.get(recipeId)
      if (!r) continue
      kcal += macrosPerServing(r, week.recipeIngredients.get(recipeId) ?? [], week.ingredientsById).calories * p.servings
    }
    return Math.round(kcal)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* cabecera editorial: overline + fecha en Fraunces */}
      <div className="anim-rise flex flex-wrap items-end justify-between gap-2" style={stagger(0)}>
        <div>
          <p className="text-xs uppercase text-ink/50">hoy</p>
          <h2 className="text-3xl sm:text-4xl">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
        </div>
        <Link to="/calendario" viewTransition className="text-xs font-bold uppercase underline underline-offset-4">
          Ver semana →
        </Link>
      </div>

      {myRatingsCount !== null && myRatingsCount < 10 && (
        <Link to="/calibrar" viewTransition className="anim-rise block" style={stagger(1)}>
          <Banner variant="warn">El recomendador aún no te conoce — calibra tus gustos (2 min) →</Banner>
        </Link>
      )}

      {fiambreras && fiambreras.items.length > 0 && (
        <div className="anim-rise flex flex-col gap-2" style={stagger(1)}>
          {fiambreras.items.slice(0, 3).map((l) => {
            const name = l.entry.recipe_id
              ? (fiambreras.recipesById.get(l.entry.recipe_id)?.name ?? 'una comida')
              : 'una comida'
            const freeze = suggestFreeze(
              l,
              l.entry.recipe_id ? (fiambreras.linesByRecipe.get(l.entry.recipe_id) ?? []) : [],
              week.ingredientsById,
            )
            return (
              <Link key={l.entry.id} to="/planificar" viewTransition className="block">
                <Banner variant={freeze ? 'warn' : 'ok'}>
                  🥡 Tienes fiambrera de {name} ({l.servings} {l.servings === 1 ? 'ración' : 'raciones'}
                  {l.entry.frozen
                    ? ', congelada'
                    : l.daysLeft === 0
                      ? ', caduca hoy'
                      : `, ${l.daysLeft} ${l.daysLeft === 1 ? 'día' : 'días'}`}
                  )
                  {freeze && ' — ❄️ congélala si no cae hoy'} →
                </Banner>
              </Link>
            )
          })}
        </div>
      )}

      {weekEmpty ? (
        <div className="anim-rise border-brutal shadow-brutal flex flex-col items-center gap-4 bg-white p-10 text-center" style={stagger(1)}>
          <p className="text-xs uppercase text-ink/50">semana sin planificar</p>
          <h3 className="text-2xl">Aún no hay nada en la carta</h3>
          <Link to="/planificar" viewTransition>
            <Button variant="primary">Planificar semana</Button>
          </Link>
        </div>
      ) : todayEntries.length === 0 ? (
        <div className="anim-rise border-brutal shadow-brutal flex flex-col items-center gap-4 bg-white p-10 text-center" style={stagger(1)}>
          <p className="text-xs uppercase text-ink/50">hoy libre</p>
          <h3 className="text-2xl">Nada planificado para hoy</h3>
          <Link to="/calendario" viewTransition>
            <Button>Abrir el calendario</Button>
          </Link>
        </div>
      ) : (
        <>
          {featured && <FeatureCard entry={featured} week={week} onCooked={markCooked} onLeftover={updateLeftover} />}

          {/* el resto del día, como sumario de revista */}
          <div className="anim-rise border-brutal bg-white px-4" style={stagger(2)}>
            {SLOTS.filter((s) => porSlot(s)?.id !== featured?.id).map((slot) => (
              <SlotRow key={slot} slot={slot} entry={porSlot(slot) ?? null} week={week} onCooked={markCooked} onLeftover={updateLeftover} />
            ))}
          </div>
        </>
      )}

      {members.length > 0 && !weekEmpty && (
        <div className="anim-rise border-brutal flex flex-col gap-3 bg-white p-4" style={stagger(3)}>
          <p className="text-xs uppercase text-ink/50">lo de hoy, en números</p>
          {members.map((m) => (
            <KcalBar key={m!.user_id} name={m!.profile.display_name} accent={m!.accent} kcal={memberKcal(m!.user_id)} goal={m!.profile.daily_calorie_goal} />
          ))}
        </div>
      )}

      {rating && <QuickRating recipeId={rating.id} recipeName={rating.name} onClose={() => setRating(null)} />}
    </div>
  )
}

type LeftoverPatch = { leftover_servings?: number; frozen?: boolean }

/** "¿sobró algo?": stepper de 0,5 en 0,5 + congelar, visible al marcar cocinada */
function LeftoverControl({ entry, onLeftover }: { entry: MealEntry; onLeftover: (e: MealEntry, p: LeftoverPatch) => void }) {
  const v = entry.leftover_servings
  const step = (d: number) => onLeftover(entry, { leftover_servings: Math.max(0, v + d) })
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="uppercase text-ink/50">¿sobró algo?</span>
      <span className="flex items-center gap-1">
        <button
          onClick={() => step(-0.5)}
          disabled={v <= 0}
          aria-label="media ración menos"
          className="press-brutal grid size-7 place-items-center border-2 border-ink bg-white font-bold disabled:opacity-30"
        >
          −
        </button>
        <span className="w-8 text-center font-bold" data-numeric>
          {v}
        </span>
        <button
          onClick={() => step(0.5)}
          aria-label="media ración más"
          className="press-brutal grid size-7 place-items-center border-2 border-ink bg-white font-bold"
        >
          +
        </button>
      </span>
      <span className="text-ink/50">raciones</span>
      {v > 0 && (
        <button
          onClick={() => onLeftover(entry, { frozen: !entry.frozen })}
          className={`press-brutal border-2 border-ink px-2 py-1 font-bold uppercase ${entry.frozen ? 'bg-ink text-paper' : 'bg-white'}`}
        >
          {entry.frozen ? '🧊 congelada' : 'congelar'}
        </button>
      )}
    </div>
  )
}

/** pieza destacada: la próxima comida, en grande y con Fraunces */
function FeatureCard({
  entry,
  week,
  onCooked,
  onLeftover,
}: {
  entry: MealEntry
  week: Week
  onCooked: (e: MealEntry) => void
  onLeftover: (e: MealEntry, p: LeftoverPatch) => void
}) {
  const { me, partner } = useHousehold()
  const members = [me, partner].filter(Boolean)
  const recipe = entry.recipe_id ? week.recipesById.get(entry.recipe_id) : null
  const cook = members.find((m) => m?.user_id === entry.cook_user_id)
  const kcal = kcalPorRacion(entry.recipe_id, week)
  const minutos = recipe ? recipe.prep_minutes + recipe.cook_minutes : null
  const especial = entry.entry_type === 'fuera' || entry.entry_type === 'cheat' || entry.entry_type === 'evento'

  return (
    <section className="anim-rise border-brutal shadow-brutal-lg flex flex-col gap-3 overflow-hidden bg-white p-5 sm:p-6" style={stagger(1)}>
      {recipe && !especial && (
        <RecipeImage recipe={recipe} className="-mx-5 -mt-5 w-[calc(100%+2.5rem)] sm:-mx-6 sm:-mt-6 sm:aspect-[21/9] sm:w-[calc(100%+3rem)]" />
      )}
      <p className="flex items-center gap-2 text-xs uppercase text-ink/50">
        {entry.cooked_at && <span className="anim-pop font-bold text-ok">✓</span>}
        {entry.meal_slot}
        {cook && (
          <>
            <span aria-hidden>·</span>
            cocina <span className={`font-bold ${accentText[cook.accent]}`}>{cook.profile.display_name}</span>
          </>
        )}
      </p>

      {especial ? (
        <h3 className="text-3xl capitalize italic sm:text-4xl">{entry.entry_type}</h3>
      ) : (
        <>
          <h3 className={`text-3xl sm:text-4xl ${entry.cooked_at ? 'strike-cooked text-ink/50' : ''}`}>
            {entry.entry_type === 'sobras' && <span className="mr-2 align-middle font-sans text-sm font-bold uppercase not-italic text-warn">sobras ·</span>}
            {recipe ? (
              <Link to={`/recetas/${recipe.id}`} viewTransition>
                {recipe.name}
              </Link>
            ) : (
              '—'
            )}
          </h3>

          {(kcal !== null || minutos !== null) && (
            <p className="text-sm text-ink/60" data-numeric>
              {kcal !== null && <>{kcal} kcal/ración</>}
              {kcal !== null && minutos !== null && ' · '}
              {minutos !== null && <>{minutos} min</>}
            </p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-ink/10 pt-3">
            {members.map((m) => {
              const p = week.portions.find((x) => x.entry_id === entry.id && x.user_id === m!.user_id)
              if (!p) return null
              const override = p.recipe_id ? week.recipesById.get(p.recipe_id) : null
              return (
                <p key={m!.user_id} className="flex items-center gap-2 text-sm" data-numeric>
                  <span className={`size-2.5 rounded-full ${accentBg[m!.accent]}`} />
                  {p.servings} ración{p.servings === 1 ? '' : 'es'}
                  {override && <span className="font-bold">→ {override.name}</span>}
                </p>
              )
            })}
          </div>

          <Button variant={entry.cooked_at ? 'default' : 'primary'} onClick={() => onCooked(entry)} className="self-start">
            {entry.cooked_at ? '✓ Cocinada (deshacer)' : '✓ Marcar cocinada'}
          </Button>

          {entry.cooked_at && entry.entry_type === 'normal' && (
            <LeftoverControl entry={entry} onLeftover={onLeftover} />
          )}
        </>
      )}
    </section>
  )
}

/** fila compacta del sumario: slot, plato y kcal alineadas a la derecha */
function SlotRow({
  slot,
  entry,
  week,
  onCooked,
  onLeftover,
}: {
  slot: MealSlot
  entry: MealEntry | null
  week: Week
  onCooked: (e: MealEntry) => void
  onLeftover: (e: MealEntry, p: LeftoverPatch) => void
}) {
  const recipe = entry?.recipe_id ? week.recipesById.get(entry.recipe_id) : null
  const kcal = kcalPorRacion(entry?.recipe_id, week)
  const especial = entry && (entry.entry_type === 'fuera' || entry.entry_type === 'cheat' || entry.entry_type === 'evento')

  return (
    <div className="border-b border-ink/10 py-3 last:border-b-0">
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs uppercase text-ink/50">{slot}</span>

      {!entry ? (
        <span className="text-sm text-ink/35">— sin plan —</span>
      ) : especial ? (
        <span className="font-display italic">{entry.entry_type}</span>
      ) : (
        <>
          <span className={`min-w-0 truncate font-display text-lg ${entry.cooked_at ? 'strike-cooked text-ink/45' : ''}`}>
            {entry.entry_type === 'sobras' && <span className="mr-1 font-sans text-xs font-bold uppercase text-warn">sobras</span>}
            {recipe ? (
              <Link to={`/recetas/${recipe.id}`} viewTransition>
                {recipe.name}
              </Link>
            ) : (
              '—'
            )}
          </span>
          <span className="ml-auto shrink-0 text-sm text-ink/55" data-numeric>
            {kcal !== null ? `${kcal} kcal` : ''}
          </span>
          <button
            onClick={() => onCooked(entry)}
            aria-label={entry.cooked_at ? `Desmarcar ${slot}` : `Marcar ${slot} cocinada`}
            className={`press-brutal grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold ${
              entry.cooked_at ? 'anim-pop border-ok bg-ok text-white' : 'border-ink/20 text-ink/40'
            }`}
          >
            ✓
          </button>
        </>
      )}
    </div>
    {entry?.cooked_at && entry.entry_type === 'normal' && !especial && (
      <div className="mt-2 pl-20 sm:pl-23">
        <LeftoverControl entry={entry} onLeftover={onLeftover} />
      </div>
    )}
    </div>
  )
}

/** barra de progreso de kcal por persona, con count-up */
function KcalBar({ name, accent, kcal, goal }: { name: string; accent: 'a' | 'b'; kcal: number; goal: number }) {
  const value = useCountUp(kcal)
  const pct = goal > 0 ? Math.min(100, (kcal / goal) * 100) : 0
  const over = goal > 0 && kcal > goal

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className={`font-bold ${accentText[accent]}`}>{name}</span>
        <span className={over ? 'font-bold text-person-a' : 'text-ink/60'} data-numeric>
          {value} / {goal} kcal
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/10">
        <div className={`anim-bar h-full rounded-full ${accentBg[accent]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
