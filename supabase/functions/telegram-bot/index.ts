// Edge Function: webhook del bot de Telegram.
// Telegram hace POST con cada update; se valida el secret del webhook y se
// responde siempre 200 para evitar reintentos.
// Secrets necesarios (supabase secrets set):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta la plataforma.

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!

const SLOT_ORDER = ['desayuno', 'comida', 'cena'] as const
const ENTRY_TYPE_LABEL: Record<string, string> = {
  fuera: 'COMER FUERA',
  cheat: 'CHEAT MEAL',
  evento: 'EVENTO',
  sobras: 'SOBRAS',
}

const AYUDA = `PLAN DEL HAMBRE — COMANDOS

HOY · qué se come hoy
MAÑANA · qué se come mañana
COMPRA · lista de la semana
AÑADE <cosa> · a la lista ("añade 2 kg arroz")
MARCA <cosa> · tachar de la lista
DESPENSA <cosa> · a la despensa ("despensa yogur caduca 2026-06-20")

Sin rodeos. Escribe y come.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lunes (inicio de semana) de la fecha dada, en ISO YYYY-MM-DD (UTC simple). */
function mondayOf(date: Date): string {
  const d = new Date(date)
  const day = (d.getUTCDay() + 6) % 7 // 0 = lunes
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "martes, 10 de junio" para cabeceras. */
function fechaLarga(d: Date): string {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) console.error('sendMessage falló:', res.status, await res.text())
}

/** user_id vinculado al chat, o null. */
async function linkedUser(chatId: number): Promise<string | null> {
  const { data } = await supabase.from('telegram_links').select('user_id').eq('chat_id', chatId).maybeSingle()
  return data?.user_id ?? null
}

/** household del usuario, o null si no pertenece a ninguno. */
async function householdOf(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  return data?.household_id ?? null
}

/** Mapa user_id → display_name. */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const { data } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
  return new Map((data ?? []).map((p) => [p.id, p.display_name]))
}

/** Lista de la compra de la semana actual; la crea si create=true. */
async function currentList(householdId: string, create = false): Promise<string | null> {
  const weekStart = mondayOf(new Date())
  const { data } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (data) return data.id
  if (!create) return null
  const { data: created, error } = await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, week_start: weekStart })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "2 kg arroz" → { quantity: 2, unit: 'kg', name: 'arroz' }. */
function parseItemText(text: string): { quantity: number | null; unit: string | null; name: string } {
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|ud|uds|pieza|piezas|cdta|cda|taza|tazas)?\s+(.+)$/i)
  if (!m) return { quantity: null, unit: null, name: text.trim() }
  return {
    quantity: parseFloat(m[1].replace(',', '.')),
    unit: m[2]?.toLowerCase() ?? null,
    name: m[3].trim(),
  }
}

/** "yogur caduca 2026-06-20" / "yogur caduca el 20/06" → nombre + fecha. */
function parseExpiry(text: string): { name: string; expiresOn: string | null } {
  let m = text.match(/^(.*?)\s+caduca(?:\s+el)?\s+(\d{4}-\d{2}-\d{2})\s*$/i)
  if (m) return { name: m[1].trim(), expiresOn: m[2] }
  m = text.match(/^(.*?)\s+caduca(?:\s+el)?\s+(\d{1,2})\/(\d{1,2})\s*$/i)
  if (m) {
    const year = new Date().getUTCFullYear()
    const mm = m[3].padStart(2, '0')
    const dd = m[2].padStart(2, '0')
    return { name: m[1].trim(), expiresOn: `${year}-${mm}-${dd}` }
  }
  return { name: text.trim(), expiresOn: null }
}

/** Ingrediente con nombre EXACTO (lowercase), o null. */
async function findIngredient(name: string): Promise<{ id: number; default_unit: string } | null> {
  const { data } = await supabase
    .from('ingredients')
    .select('id, default_unit')
    .eq('name', name.toLowerCase())
    .maybeSingle()
  return data
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

async function cmdStart(chatId: number, code: string | null): Promise<string> {
  if (!code || !UUID_RE.test(code)) {
    return 'VINCULA TU CUENTA\n\nAbre tu perfil en la app, copia el código de Telegram y mándame:\n/start <código>'
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('telegram_link_code', code)
    .maybeSingle()
  if (!profile) {
    return 'CÓDIGO INVÁLIDO\n\nRevisa tu perfil en la app y vuelve a intentarlo con /start <código>'
  }
  const { error } = await supabase
    .from('telegram_links')
    .upsert({ chat_id: chatId, user_id: profile.id })
  if (error) throw error
  return `VINCULADO\n\nHola, ${profile.display_name}. Escribe "ayuda" para ver qué sé hacer.`
}

/** Comidas del día (hoy o mañana) del hogar. */
async function cmdDia(householdId: string, offsetDays: number): Promise<string> {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  const { data: entries } = await supabase
    .from('meal_entries')
    .select('meal_slot, entry_type, cook_user_id, recipes(name)')
    .eq('household_id', householdId)
    .eq('date', isoDate(d))
  const header = `${offsetDays === 0 ? 'HOY' : 'MAÑANA'} — ${fechaLarga(d)}`
  if (!entries || entries.length === 0) return `${header}\n\nNADA PLANIFICADO. A ver qué hacéis.`

  const names = await displayNames(entries.map((e) => e.cook_user_id).filter(Boolean) as string[])
  const lines: string[] = []
  for (const slot of SLOT_ORDER) {
    const e = entries.find((x) => x.meal_slot === slot)
    if (!e) continue
    const recipe = e.recipes as unknown as { name: string } | null
    const what = ENTRY_TYPE_LABEL[e.entry_type] ?? recipe?.name ?? '(sin receta)'
    const cook = e.cook_user_id ? ` — cocina ${names.get(e.cook_user_id) ?? '?'}` : ''
    lines.push(`${slot.toUpperCase()}: ${what}${cook}`)
  }
  return `${header}\n\n${lines.join('\n')}`
}

async function cmdCompra(householdId: string): Promise<string> {
  const listId = await currentList(householdId)
  if (!listId) return 'NO HAY LISTA esta semana. Genera una desde la app o usa "añade <cosa>".'

  const { data: items } = await supabase
    .from('shopping_list_items')
    .select('name, quantity, unit, category, checked')
    .eq('list_id', listId)
    .order('sort_order')
  if (!items || items.length === 0) return 'LISTA VACÍA. Nada que comprar.'

  const pending = items.filter((i) => !i.checked)
  const done = items.length - pending.length
  if (pending.length === 0) return `TODO COMPRADO. ✓ ${done} ya comprados.`

  // agrupar por categoría (pasillo)
  const byCategory = new Map<string, string[]>()
  for (const i of pending) {
    const qty = i.quantity ? ` — ${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : ''
    const cat = i.category ?? 'OTROS'
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), `· ${i.name}${qty}`])
  }
  const blocks = [...byCategory].map(([cat, lines]) => `${cat.toUpperCase()}\n${lines.join('\n')}`)
  const footer = done > 0 ? `\n\n✓ ${done} ya comprados` : ''
  return `LA COMPRA\n\n${blocks.join('\n\n')}${footer}`
}

async function cmdAnade(householdId: string, text: string): Promise<string> {
  if (!text) return 'AÑADIR QUÉ. Ejemplo: añade 2 kg arroz'
  const listId = await currentList(householdId, true)
  const { quantity, unit, name } = parseItemText(text)
  const ingredient = await findIngredient(name)
  const { count } = await supabase
    .from('shopping_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', listId)
  const { error } = await supabase.from('shopping_list_items').insert({
    list_id: listId,
    ingredient_id: ingredient?.id ?? null,
    name,
    quantity,
    unit: unit ?? (quantity !== null ? ingredient?.default_unit ?? null : null),
    sort_order: count ?? 0,
  })
  if (error) throw error
  return `APUNTADO: ${name}${quantity ? ` (${quantity}${unit ? ` ${unit}` : ''})` : ''}`
}

async function cmdMarca(householdId: string, userId: string, text: string): Promise<string> {
  if (!text) return 'MARCAR QUÉ. Ejemplo: marca arroz'
  const listId = await currentList(householdId)
  if (!listId) return 'NO HAY LISTA esta semana. Nada que marcar.'

  const { data: matches } = await supabase
    .from('shopping_list_items')
    .select('id, name')
    .eq('list_id', listId)
    .eq('checked', false)
    .ilike('name', `%${text}%`)
  if (!matches || matches.length === 0) return `NADA en la lista que contenga "${text}".`
  if (matches.length > 1) {
    return `HAY ${matches.length} CANDIDATOS:\n${matches.map((m) => `· ${m.name}`).join('\n')}\n\nAfina más.`
  }
  const { error } = await supabase
    .from('shopping_list_items')
    .update({ checked: true, checked_by: userId })
    .eq('id', matches[0].id)
  if (error) throw error
  return `✓ MARCADO: ${matches[0].name}`
}

async function cmdDespensa(householdId: string, userId: string, text: string): Promise<string> {
  if (!text) return 'DESPENSA QUÉ. Ejemplo: despensa yogur caduca 2026-06-20'
  const { name, expiresOn } = parseExpiry(text)
  const ingredient = await findIngredient(name)
  const { error } = await supabase.from('pantry_items').insert({
    household_id: householdId,
    name,
    ingredient_id: ingredient?.id ?? null,
    expires_on: expiresOn,
    added_by: userId,
  })
  if (error) throw error
  return `EN LA DESPENSA: ${name}${expiresOn ? ` (caduca ${expiresOn})` : ''}`
}

// ---------------------------------------------------------------------------
// Enrutado de mensajes
// ---------------------------------------------------------------------------

async function handleMessage(chatId: number, rawText: string): Promise<string> {
  const text = rawText.trim()
  const lower = text.toLowerCase().replace(/^\//, '') // case-insensitive, con y sin '/'

  // /start funciona sin vincular
  if (lower.startsWith('start')) {
    return await cmdStart(chatId, text.split(/\s+/)[1] ?? null)
  }

  const userId = await linkedUser(chatId)
  if (!userId) {
    return 'CHAT SIN VINCULAR\n\nAbre tu perfil en la app, copia el código y mándame:\n/start <código>'
  }
  const householdId = await householdOf(userId)
  if (!householdId) return 'NO TIENES HOGAR. Crea o únete a uno desde la app primero.'

  // argumento tras la palabra de comando ("añade 2 kg arroz" → "2 kg arroz")
  const arg = text.replace(/^\/?\S+\s*/, '').trim()

  if (lower === 'hoy' || lower === 'qué hay hoy' || lower === 'que hay hoy') {
    return await cmdDia(householdId, 0)
  }
  if (lower === 'mañana' || lower === 'manana') return await cmdDia(householdId, 1)
  if (lower === 'compra') return await cmdCompra(householdId)
  if (lower.startsWith('añade') || lower.startsWith('anade') || lower.startsWith('apunta') || lower.startsWith('add')) {
    return await cmdAnade(householdId, arg)
  }
  if (lower.startsWith('marca')) return await cmdMarca(householdId, userId, arg)
  if (lower.startsWith('despensa')) return await cmdDespensa(householdId, userId, arg)

  return AYUDA // 'ayuda' y cualquier cosa no reconocida
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // validar secret del webhook (lo manda Telegram en cada update)
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'secret inválido' }), { status: 401 })
  }

  try {
    const update = await req.json().catch(() => null)
    const message = update?.message
    if (message?.text && message.chat?.id) {
      const reply = await handleMessage(message.chat.id, message.text)
      await sendMessage(message.chat.id, reply)
    }
  } catch (err) {
    // 200 igualmente: si no, Telegram reintenta en bucle
    console.error('telegram-bot error:', err)
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
