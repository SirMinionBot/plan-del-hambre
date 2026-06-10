// Edge Function: envío de Web Push.
// Invocada por pg_cron (ver migración 008) con body {"type": "weekly-plan"} o {"type": "expiry"}.
// Secrets necesarios (supabase secrets set):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta la plataforma.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hola@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

interface Notification {
  userIds: string[]
  title: string
  body: string
  url: string
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function nextMonday(): Date {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() + (7 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

/** Domingo: hogares con la semana siguiente incompleta (comida+cena = 14 huecos). */
async function weeklyPlanNotifications(): Promise<Notification[]> {
  const monday = nextMonday()
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)

  const { data: households } = await supabase.from('households').select('id, household_members(user_id)')
  const out: Notification[] = []
  for (const h of households ?? []) {
    const { count } = await supabase
      .from('meal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', h.id)
      .gte('date', isoDate(monday))
      .lte('date', isoDate(sunday))
      .in('meal_slot', ['comida', 'cena'])
    if ((count ?? 0) >= 14) continue
    out.push({
      userIds: h.household_members.map((m: { user_id: string }) => m.user_id),
      title: '¿PLANIFICAMOS?',
      body: 'La semana que viene está sin cerrar. Tengo una propuesta lista.',
      url: '/planificar',
    })
  }
  return out
}

/** Diario: despensa que caduca en <= 2 días, agrupada por hogar en un solo aviso. */
async function expiryNotifications(): Promise<Notification[]> {
  const limit = new Date()
  limit.setDate(limit.getDate() + 2)
  const { data: items } = await supabase
    .from('pantry_items')
    .select('name, expires_on, household_id')
    .not('expires_on', 'is', null)
    .lte('expires_on', isoDate(limit))

  const byHousehold = new Map<string, string[]>()
  for (const i of items ?? []) {
    byHousehold.set(i.household_id, [...(byHousehold.get(i.household_id) ?? []), i.name])
  }

  const out: Notification[] = []
  for (const [householdId, names] of byHousehold) {
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
    out.push({
      userIds: (members ?? []).map((m) => m.user_id),
      title: 'LA DESPENSA SE MUERE',
      body: `Caduca ya: ${names.join(', ')}. Rescátalo en el plan.`,
      url: '/despensa',
    })
  }
  return out
}

/** Noche antes: recetas de mañana con ingredientes típicamente congelados. */
async function defrostNotifications(): Promise<Notification[]> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const { data: entries } = await supabase
    .from('meal_entries')
    .select('household_id, recipe_id')
    .eq('date', isoDate(tomorrow))
    .in('entry_type', ['normal'])
    .not('recipe_id', 'is', null)

  const out: Notification[] = []
  const byHousehold = new Map<string, string[]>()
  for (const e of entries ?? []) {
    const { data: frozen } = await supabase
      .from('recipe_ingredients')
      .select('ingredients!inner(name, typically_frozen)')
      .eq('recipe_id', e.recipe_id)
      .eq('ingredients.typically_frozen', true)
    const names = (frozen ?? []).map(
      (f: { ingredients: { name: string } | { name: string }[] }) =>
        Array.isArray(f.ingredients) ? f.ingredients[0]?.name : f.ingredients.name,
    )
    if (names.length) {
      byHousehold.set(e.household_id, [...new Set([...(byHousehold.get(e.household_id) ?? []), ...names])])
    }
  }
  for (const [householdId, names] of byHousehold) {
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', householdId)
    out.push({
      userIds: (members ?? []).map((m) => m.user_id),
      title: 'SACA DEL CONGELADOR',
      body: `Mañana toca: ${names.join(', ')}. Al frigo esta noche.`,
      url: '/',
    })
  }
  return out
}

async function send(notifications: Notification[]): Promise<{ sent: number; dropped: number }> {
  let sent = 0
  let dropped = 0
  for (const n of notifications) {
    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', n.userIds)
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url }),
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // suscripción muerta: limpiar
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          dropped++
        }
      }
    }
  }
  return { sent, dropped }
}

Deno.serve(async (req) => {
  // Desplegada con --no-verify-jwt (la anon key sb_publishable_ no es JWT):
  // se protege con secret propio que solo conoce pg_cron.
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }
  const { type } = (await req.json().catch(() => ({}))) as { type?: string }
  const notifications =
    type === 'weekly-plan'
      ? await weeklyPlanNotifications()
      : type === 'expiry'
        ? await expiryNotifications()
        : type === 'defrost'
          ? await defrostNotifications()
          : null
  if (!notifications) {
    return new Response(JSON.stringify({ error: 'type debe ser weekly-plan, expiry o defrost' }), { status: 400 })
  }
  const result = await send(notifications)
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
