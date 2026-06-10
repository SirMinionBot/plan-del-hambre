// Edge Function: webhook del bot de Telegram.
// Telegram hace POST con cada update; se valida el secret del webhook y se
// responde siempre 200 para evitar reintentos.
// Bot 100% determinista: router de comandos por token exacto (con alias),
// validación de argumentos por comando y desambiguación sin estado.
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
const DAY_LABELS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const
const ENTRY_TYPE_LABEL: Record<string, string> = {
  fuera: 'COMER FUERA',
  cheat: 'CHEAT MEAL',
  evento: 'EVENTO',
  sobras: 'SOBRAS',
}

// Unidades reconocidas → unidad canónica + factor de conversión.
const UNIT_MAP: Record<string, { unit: string; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  ud: { unit: 'pieza', factor: 1 },
  uds: { unit: 'pieza', factor: 1 },
  pieza: { unit: 'pieza', factor: 1 },
  piezas: { unit: 'pieza', factor: 1 },
  cda: { unit: 'cda', factor: 1 },
  cdta: { unit: 'cdta', factor: 1 },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUM_RE = /^\d+(?:[.,]\d+)?$/

const AYUDA = `<b>PLAN DEL HAMBRE — COMANDOS</b>

<b>COMIDAS</b>
/hoy · comidas de hoy
/manana · comidas de mañana
/semana · plan de la semana actual
/quien · quién cocina hoy y mañana
/cocinada &lt;desayuno|comida|cena&gt; · marcar cocinada (hoy)

<b>COMPRA</b>
/compra · pendientes por categoría
/apunta [cantidad] [unidad] &lt;nombre&gt; · añadir a la lista
/marca &lt;texto&gt; · marcar comprado
/desmarca &lt;texto&gt; · desmarcar
/quita &lt;texto&gt; · quitar de la lista

<b>DESPENSA</b>
/despensa · todo, por caducidad
/guarda &lt;nombre&gt; [caduca &lt;fecha&gt;] · añadir
/gastado &lt;texto&gt; · eliminar
/caduca · caduca en 3 días o menos

<b>RECETAS</b>
/receta &lt;texto&gt; · ficha de receta
/nota &lt;1-5&gt; &lt;texto receta&gt; · puntuar
/veto &lt;texto receta&gt; · vetar
/desveto &lt;texto receta&gt; · quitar veto

Fechas: YYYY-MM-DD o DD/MM. Unidades: g, kg, ml, l, ud, pieza, cda, cdta.
Vincular: /start &lt;código&gt; (código en tu perfil de la app).
Sin rodeos. Escribe y come.`

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** lowercase + sin tildes; base de TODAS las comparaciones de texto. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Escapa HTML para parse_mode HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
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

/** ISO válido y real (rechaza 2026-02-31). */
function validIso(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`)
  return !isNaN(d.getTime()) && isoDate(d) === iso
}

/** Fecha en YYYY-MM-DD o DD/MM (año actual; si ya pasó, el siguiente). Null si no cumple. */
function parseFecha(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return validIso(s) ? s : null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const today = isoDate(new Date())
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  let iso = `${today.slice(0, 4)}-${mm}-${dd}`
  if (!validIso(iso)) return null
  if (iso < today) {
    iso = `${Number(today.slice(0, 4)) + 1}-${mm}-${dd}`
    if (!validIso(iso)) return null
  }
  return iso
}

/** "2 kg arroz" → cantidad normalizada + nombre. Sin unidad reconocida → todo es nombre. */
function parseCantidad(tokens: string[]): { quantity: number | null; unit: string | null; name: string } {
  if (tokens.length >= 3 && NUM_RE.test(tokens[0])) {
    const u = UNIT_MAP[norm(tokens[1])]
    if (u) {
      return {
        quantity: parseFloat(tokens[0].replace(',', '.')) * u.factor,
        unit: u.unit,
        name: tokens.slice(2).join(' '),
      }
    }
  }
  return { quantity: null, unit: null, name: tokens.join(' ') }
}

/** Días enteros desde hoy (UTC) hasta la fecha ISO. Negativo = pasado. */
function diasHasta(iso: string): number {
  return Math.floor((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${isoDate(new Date())}T00:00:00Z`)) / 86400000)
}

function etiquetaCaducidad(iso: string | null): string {
  if (!iso) return ''
  const dias = diasHasta(iso)
  if (dias < 0) return ' — CADUCADO'
  if (dias === 0) return ' — caduca HOY'
  return ` — ${dias} día${dias === 1 ? '' : 's'}`
}

function formatQty(quantity: number | null, unit: string | null): string {
  if (quantity === null) return ''
  return ` — ${quantity}${unit ? ` ${unit}` : ''}`
}

/** Comparador alfabético determinista sobre texto normalizado. */
function byName<T extends { name: string }>(a: T, b: T): number {
  const na = norm(a.name)
  const nb = norm(b.name)
  return na < nb ? -1 : na > nb ? 1 : 0
}

/** Regla 5: substring case/accent-insensitive, orden alfabético. */
function filterByText<T extends { name: string }>(items: T[], query: string): T[] {
  const q = norm(query)
  return items.filter((i) => norm(i.name).includes(q)).sort(byName)
}

/** Mensaje de ambigüedad numerado (máx. 10 mostrados). */
function ambiguos(matches: { name: string }[], texto: string): string {
  const shown = matches.slice(0, 10).map((m, i) => `${i + 1}. ${esc(m.name)}`)
  const extra = matches.length > 10 ? `\n… y ${matches.length - 10} más` : ''
  return `HAY ${matches.length} COINCIDENCIAS con "${esc(texto)}":\n${shown.join('\n')}${extra}\n\nRepite con el nombre completo.`
}

function entryLabel(e: { entry_type: string; recipes: unknown }): string {
  if (e.entry_type !== 'normal') return ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type.toUpperCase()
  const r = e.recipes as { name: string } | null
  return r?.name ?? '(sin receta)'
}

// ---------------------------------------------------------------------------
// Helpers de datos
// ---------------------------------------------------------------------------

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
async function currentList(
  householdId: string,
  create = false,
): Promise<{ id: string; actual_cost: number | null } | null> {
  const weekStart = mondayOf(new Date())
  const { data } = await supabase
    .from('shopping_lists')
    .select('id, actual_cost')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (data) return data
  if (!create) return null
  const { data: created, error } = await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, week_start: weekStart })
    .select('id, actual_cost')
    .single()
  if (error) throw error
  return created
}

/** Ingrediente con nombre EXACTO (lowercase), o null. */
async function findIngredient(
  name: string,
): Promise<{ id: number; default_unit: string; category: string | null } | null> {
  const { data } = await supabase
    .from('ingredients')
    .select('id, default_unit, ingredient_categories(name)')
    .eq('name', name.toLowerCase())
    .maybeSingle()
  if (!data) return null
  const cat = data.ingredient_categories as unknown as { name: string } | null
  return { id: data.id, default_unit: data.default_unit, category: cat?.name ?? null }
}

/** Recetas visibles para el hogar (propias + catálogo global). */
async function visibleRecipes(householdId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('recipes')
    .select('id, name')
    .or(`household_id.eq.${householdId},household_id.is.null`)
  return data ?? []
}

/** Entradas de un día con receta y cocinero. */
async function entriesOf(householdId: string, dateIso: string) {
  const { data } = await supabase
    .from('meal_entries')
    .select('id, meal_slot, entry_type, cook_user_id, cooked_at, recipes(name)')
    .eq('household_id', householdId)
    .eq('date', dateIso)
  return data ?? []
}

// ---------------------------------------------------------------------------
// Handlers de comandos
// ---------------------------------------------------------------------------

type CmdCtx = { chatId: number; userId: string; householdId: string; arg: string }
type Cmd = { usage: string; aliases: string[]; handler: (ctx: CmdCtx) => Promise<string> }

function uso(name: string): string {
  return `Uso: ${esc(COMMANDS[name].usage)}`
}

/** Comidas de un día (offset 0 = hoy, 1 = mañana). */
async function cmdDia(householdId: string, offsetDays: number): Promise<string> {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  const entries = await entriesOf(householdId, isoDate(d))
  const header = `<b>${offsetDays === 0 ? 'HOY' : 'MAÑANA'} — ${fechaLarga(d)}</b>`
  if (entries.length === 0) return `${header}\n\nNADA PLANIFICADO. A ver qué hacéis.`

  const names = await displayNames(entries.map((e) => e.cook_user_id).filter(Boolean) as string[])
  const lines: string[] = []
  for (const slot of SLOT_ORDER) {
    const e = entries.find((x) => x.meal_slot === slot)
    if (!e) continue
    const cook = e.cook_user_id ? ` — cocina ${esc(names.get(e.cook_user_id) ?? '?')}` : ''
    lines.push(`${slot.toUpperCase()}: ${esc(entryLabel(e))}${cook}`)
  }
  return `${header}\n\n${lines.join('\n')}`
}

/** Semana actual compacta: "LUN: comida / cena". */
async function cmdSemana(householdId: string): Promise<string> {
  const monday = mondayOf(new Date())
  const sunday = addDays(monday, 6)
  const { data: entries } = await supabase
    .from('meal_entries')
    .select('date, meal_slot, entry_type, recipes(name)')
    .eq('household_id', householdId)
    .gte('date', monday)
    .lte('date', sunday)

  const lines: string[] = []
  for (let i = 0; i < 7; i++) {
    const dayIso = addDays(monday, i)
    const ofDay = (entries ?? []).filter((e) => e.date === dayIso)
    const slot = (s: string) => {
      const e = ofDay.find((x) => x.meal_slot === s)
      return e ? esc(entryLabel(e)) : '—'
    }
    lines.push(`${DAY_LABELS[i]}: ${slot('comida')} / ${slot('cena')}`)
  }
  return `<b>SEMANA DEL ${monday}</b>\n\n${lines.join('\n')}`
}

/** Quién cocina hoy y mañana, por slot. */
async function cmdQuien(householdId: string): Promise<string> {
  const today = isoDate(new Date())
  const tomorrow = addDays(today, 1)
  const [hoy, manana] = await Promise.all([entriesOf(householdId, today), entriesOf(householdId, tomorrow)])
  const names = await displayNames(
    [...hoy, ...manana].map((e) => e.cook_user_id).filter(Boolean) as string[],
  )

  const bloque = (entries: typeof hoy): string => {
    if (entries.length === 0) return '—'
    const lines: string[] = []
    for (const slot of SLOT_ORDER) {
      const e = entries.find((x) => x.meal_slot === slot)
      if (!e) continue
      const cook = e.cook_user_id ? esc(names.get(e.cook_user_id) ?? '?') : '—'
      lines.push(`${slot.toUpperCase()}: ${cook}`)
    }
    return lines.join('\n')
  }
  return `<b>QUIÉN COCINA</b>\n\nHOY\n${bloque(hoy)}\n\nMAÑANA\n${bloque(manana)}`
}

/** Pendientes agrupados por categoría, todo alfabético. */
async function cmdCompra(ctx: CmdCtx): Promise<string> {
  const list = await currentList(ctx.householdId)
  if (!list) return 'NO HAY LISTA esta semana. Genera una desde la app o usa /apunta.'

  const { data: items } = await supabase
    .from('shopping_list_items')
    .select('name, quantity, unit, category, checked')
    .eq('list_id', list.id)
  if (!items || items.length === 0) return 'LISTA VACÍA. Nada que comprar.'

  const done = items.filter((i) => i.checked).length
  const pending = items.filter((i) => !i.checked).sort(byName)
  const footer = [
    done > 0 ? `✓ ${done} comprados` : '',
    list.actual_cost !== null ? `COSTE REAL: ${list.actual_cost} €` : '',
  ].filter(Boolean).join('\n')

  if (pending.length === 0) return `TODO COMPRADO.${footer ? `\n\n${footer}` : ''}`

  // agrupar por categoría (pasillo) en orden alfabético
  const byCategory = new Map<string, string[]>()
  for (const i of pending) {
    const cat = i.category ?? 'OTROS'
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), `· ${esc(i.name)}${formatQty(i.quantity, i.unit)}`])
  }
  const blocks = [...byCategory]
    .sort(([a], [b]) => (norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0))
    .map(([cat, lines]) => `<b>${esc(cat.toUpperCase())}</b>\n${lines.join('\n')}`)
  return `<b>LA COMPRA</b>\n\n${blocks.join('\n\n')}${footer ? `\n\n${footer}` : ''}`
}

async function cmdApunta(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('apunta')
  const { quantity, unit, name } = parseCantidad(ctx.arg.split(/\s+/))
  if (!name) return uso('apunta')

  const list = await currentList(ctx.householdId, true)
  const ingredient = await findIngredient(name)
  const { count } = await supabase
    .from('shopping_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', list!.id)
  const { error } = await supabase.from('shopping_list_items').insert({
    list_id: list!.id,
    ingredient_id: ingredient?.id ?? null,
    name,
    quantity,
    unit,
    category: ingredient?.category ?? null,
    sort_order: count ?? 0,
  })
  if (error) throw error
  return `APUNTADO: ${esc(name)}${quantity !== null ? ` (${quantity} ${unit})` : ''}`
}

/** Regla 5 sobre los ítems de la lista de esta semana. */
async function buscaEnLista(
  householdId: string,
  texto: string,
  checked: boolean | null,
): Promise<{ id: string; name: string }[] | string> {
  const list = await currentList(householdId)
  if (!list) return 'NO HAY LISTA esta semana.'
  let query = supabase.from('shopping_list_items').select('id, name').eq('list_id', list.id)
  if (checked !== null) query = query.eq('checked', checked)
  const { data } = await query
  return filterByText(data ?? [], texto)
}

async function cmdMarca(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('marca')
  const matches = await buscaEnLista(ctx.householdId, ctx.arg, false)
  if (typeof matches === 'string') return matches
  if (matches.length === 0) return `NADA pendiente que contenga "${esc(ctx.arg)}".`
  if (matches.length > 1) return ambiguos(matches, ctx.arg)
  const { error } = await supabase
    .from('shopping_list_items')
    .update({ checked: true, checked_by: ctx.userId })
    .eq('id', matches[0].id)
  if (error) throw error
  return `✓ MARCADO: ${esc(matches[0].name)}`
}

async function cmdDesmarca(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('desmarca')
  const matches = await buscaEnLista(ctx.householdId, ctx.arg, true)
  if (typeof matches === 'string') return matches
  if (matches.length === 0) return `NADA marcado que contenga "${esc(ctx.arg)}".`
  if (matches.length > 1) return ambiguos(matches, ctx.arg)
  const { error } = await supabase
    .from('shopping_list_items')
    .update({ checked: false, checked_by: null })
    .eq('id', matches[0].id)
  if (error) throw error
  return `DESMARCADO: ${esc(matches[0].name)}`
}

async function cmdQuita(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('quita')
  const matches = await buscaEnLista(ctx.householdId, ctx.arg, null)
  if (typeof matches === 'string') return matches
  if (matches.length === 0) return `NADA en la lista que contenga "${esc(ctx.arg)}".`
  if (matches.length > 1) return ambiguos(matches, ctx.arg)
  const { error } = await supabase.from('shopping_list_items').delete().eq('id', matches[0].id)
  if (error) throw error
  return `FUERA DE LA LISTA: ${esc(matches[0].name)}`
}

/** Despensa completa por caducidad ascendente; sin fecha al final. */
async function cmdDespensa(ctx: CmdCtx): Promise<string> {
  const { data: items } = await supabase
    .from('pantry_items')
    .select('name, expires_on')
    .eq('household_id', ctx.householdId)
  if (!items || items.length === 0) return 'DESPENSA VACÍA.'

  items.sort((a, b) => {
    if (a.expires_on !== b.expires_on) {
      if (a.expires_on === null) return 1
      if (b.expires_on === null) return -1
      return a.expires_on < b.expires_on ? -1 : 1
    }
    return byName(a, b)
  })
  const lines = items.map((i) => `· ${esc(i.name)}${etiquetaCaducidad(i.expires_on)}`)
  return `<b>DESPENSA</b>\n\n${lines.join('\n')}`
}

async function cmdGuarda(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('guarda')
  let name = ctx.arg
  let expiresOn: string | null = null
  const m = ctx.arg.match(/^(.+?)\s+caduca\s+(\S+)$/i)
  if (m) {
    expiresOn = parseFecha(m[2])
    if (!expiresOn) return uso('guarda')
    name = m[1].trim()
  }
  if (!name) return uso('guarda')

  const ingredient = await findIngredient(name)
  const { error } = await supabase.from('pantry_items').insert({
    household_id: ctx.householdId,
    name,
    ingredient_id: ingredient?.id ?? null,
    expires_on: expiresOn,
    added_by: ctx.userId,
  })
  if (error) throw error
  return `EN LA DESPENSA: ${esc(name)}${expiresOn ? ` (caduca ${expiresOn})` : ''}`
}

async function cmdGastado(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('gastado')
  const { data } = await supabase
    .from('pantry_items')
    .select('id, name')
    .eq('household_id', ctx.householdId)
  const matches = filterByText(data ?? [], ctx.arg)
  if (matches.length === 0) return `NADA en la despensa que contenga "${esc(ctx.arg)}".`
  if (matches.length > 1) return ambiguos(matches, ctx.arg)
  const { error } = await supabase.from('pantry_items').delete().eq('id', matches[0].id)
  if (error) throw error
  return `GASTADO: ${esc(matches[0].name)}`
}

/** Caduca en <=3 días o ya caducado. */
async function cmdCaduca(ctx: CmdCtx): Promise<string> {
  const limite = addDays(isoDate(new Date()), 3)
  const { data: items } = await supabase
    .from('pantry_items')
    .select('name, expires_on')
    .eq('household_id', ctx.householdId)
    .not('expires_on', 'is', null)
    .lte('expires_on', limite)
  if (!items || items.length === 0) return 'NADA CADUCA en 3 días. Respira.'

  items.sort((a, b) => (a.expires_on! < b.expires_on! ? -1 : a.expires_on! > b.expires_on! ? 1 : byName(a, b)))
  const lines = items.map((i) => `· ${esc(i.name)}${etiquetaCaducidad(i.expires_on)}`)
  return `<b>CADUCA YA</b>\n\n${lines.join('\n')}`
}

async function cmdCocinada(ctx: CmdCtx): Promise<string> {
  const slot = norm(ctx.arg)
  if (!(SLOT_ORDER as readonly string[]).includes(slot)) return uso('cocinada')

  const { data: entry } = await supabase
    .from('meal_entries')
    .select('id, recipe_id, cooked_at, recipes(name)')
    .eq('household_id', ctx.householdId)
    .eq('date', isoDate(new Date()))
    .eq('meal_slot', slot)
    .maybeSingle()
  if (!entry) return `HOY NO HAY ${slot.toUpperCase()} planificada.`
  if (!entry.recipe_id) return `LA ${slot.toUpperCase()} DE HOY no tiene receta. Nada que marcar.`
  if (entry.cooked_at) return `YA ESTABA COCINADA la ${slot} de hoy.`

  const { error } = await supabase
    .from('meal_entries')
    .update({ cooked_at: new Date().toISOString() })
    .eq('id', entry.id)
  if (error) throw error
  const recipe = entry.recipes as unknown as { name: string } | null
  return `✓ COCINADA: ${esc(recipe?.name ?? slot)} (${slot} de hoy)`
}

/** Regla 5 sobre recetas visibles; devuelve receta única o mensaje. */
async function buscaReceta(
  householdId: string,
  texto: string,
): Promise<{ id: string; name: string } | string> {
  const matches = filterByText(await visibleRecipes(householdId), texto)
  if (matches.length === 0) return `NINGUNA RECETA contiene "${esc(texto)}".`
  if (matches.length > 1) return ambiguos(matches, texto)
  return matches[0]
}

/** Upsert de recipe_ratings conservando el resto de campos. */
async function upsertRating(
  userId: string,
  recipeId: string,
  patch: { rating?: number; vetoed?: boolean },
): Promise<void> {
  const { data: prev } = await supabase
    .from('recipe_ratings')
    .select('rating, vetoed')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle()
  const { error } = await supabase.from('recipe_ratings').upsert({
    user_id: userId,
    recipe_id: recipeId,
    rating: patch.rating ?? prev?.rating ?? null,
    vetoed: patch.vetoed ?? prev?.vetoed ?? false,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

async function cmdNota(ctx: CmdCtx): Promise<string> {
  const tokens = ctx.arg.split(/\s+/)
  if (tokens.length < 2 || !/^[1-5]$/.test(tokens[0])) return uso('nota')
  const rating = Number(tokens[0])
  const texto = tokens.slice(1).join(' ')

  const recipe = await buscaReceta(ctx.householdId, texto)
  if (typeof recipe === 'string') return recipe
  await upsertRating(ctx.userId, recipe.id, { rating })
  return `NOTA GUARDADA: ${esc(recipe.name)} — ${rating}/5`
}

async function cmdVeto(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('veto')
  const recipe = await buscaReceta(ctx.householdId, ctx.arg)
  if (typeof recipe === 'string') return recipe
  await upsertRating(ctx.userId, recipe.id, { vetoed: true })
  return `VETADA: ${esc(recipe.name)}. No entra en casa.`
}

async function cmdDesveto(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('desveto')
  const recipe = await buscaReceta(ctx.householdId, ctx.arg)
  if (typeof recipe === 'string') return recipe
  await upsertRating(ctx.userId, recipe.id, { vetoed: false })
  return `DESVETADA: ${esc(recipe.name)}. Vuelve al ruedo.`
}

async function cmdReceta(ctx: CmdCtx): Promise<string> {
  if (!ctx.arg) return uso('receta')
  const match = await buscaReceta(ctx.householdId, ctx.arg)
  if (typeof match === 'string') return match

  const { data: recipe } = await supabase
    .from('recipes')
    .select('name, servings, prep_minutes, cook_minutes, tags, season, recipe_ingredients(quantity, unit, ingredients(name))')
    .eq('id', match.id)
    .single()
  if (!recipe) return `NINGUNA RECETA contiene "${esc(ctx.arg)}".`

  const ingredientes = (recipe.recipe_ingredients as unknown as
    { quantity: number; unit: string; ingredients: { name: string } | null }[])
    .map((ri) => ({ name: ri.ingredients?.name ?? '?', quantity: ri.quantity, unit: ri.unit }))
    .sort(byName)
    .map((i) => `· ${esc(i.name)} — ${i.quantity} ${i.unit}`)

  return [
    `<b>${esc(recipe.name.toUpperCase())}</b>`,
    '',
    `${recipe.prep_minutes + recipe.cook_minutes} MIN · ${recipe.servings} RACIONES`,
    `TAGS: ${recipe.tags.length > 0 ? esc(recipe.tags.join(', ')) : '—'}`,
    `TEMPORADA: ${esc(recipe.season)}`,
    '',
    '<b>INGREDIENTES</b>',
    ingredientes.length > 0 ? ingredientes.join('\n') : '—',
  ].join('\n')
}

async function cmdStart(chatId: number, code: string | null): Promise<string> {
  if (!code) return AYUDA // start sin código = ayuda
  if (!UUID_RE.test(code)) {
    return 'CÓDIGO INVÁLIDO\n\nRevisa tu perfil en la app y vuelve a intentarlo con /start &lt;código&gt;'
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('telegram_link_code', code)
    .maybeSingle()
  if (!profile) {
    return 'CÓDIGO INVÁLIDO\n\nRevisa tu perfil en la app y vuelve a intentarlo con /start &lt;código&gt;'
  }
  const { error } = await supabase
    .from('telegram_links')
    .upsert({ chat_id: chatId, user_id: profile.id })
  if (error) throw error
  return `VINCULADO\n\nHola, ${esc(profile.display_name)}. Escribe /ayuda para ver qué sé hacer.`
}

// ---------------------------------------------------------------------------
// Tabla de comandos (router estricto: primer token exacto, con alias)
// ---------------------------------------------------------------------------

const COMMANDS: Record<string, Cmd> = {
  hoy: { usage: '/hoy', aliases: [], handler: (c) => cmdDia(c.householdId, 0) },
  manana: { usage: '/manana', aliases: [], handler: (c) => cmdDia(c.householdId, 1) },
  semana: { usage: '/semana', aliases: [], handler: (c) => cmdSemana(c.householdId) },
  quien: { usage: '/quien', aliases: [], handler: (c) => cmdQuien(c.householdId) },
  compra: { usage: '/compra', aliases: [], handler: cmdCompra },
  apunta: { usage: '/apunta [cantidad] [unidad] <nombre>', aliases: ['anade', 'add'], handler: cmdApunta },
  marca: { usage: '/marca <texto>', aliases: ['comprado'], handler: cmdMarca },
  desmarca: { usage: '/desmarca <texto>', aliases: [], handler: cmdDesmarca },
  quita: { usage: '/quita <texto>', aliases: [], handler: cmdQuita },
  despensa: { usage: '/despensa', aliases: [], handler: cmdDespensa },
  guarda: { usage: '/guarda <nombre> [caduca <fecha>]', aliases: [], handler: cmdGuarda },
  gastado: { usage: '/gastado <texto>', aliases: [], handler: cmdGastado },
  caduca: { usage: '/caduca', aliases: [], handler: cmdCaduca },
  cocinada: { usage: '/cocinada <desayuno|comida|cena>', aliases: [], handler: cmdCocinada },
  nota: { usage: '/nota <1-5> <texto receta>', aliases: [], handler: cmdNota },
  veto: { usage: '/veto <texto receta>', aliases: [], handler: cmdVeto },
  desveto: { usage: '/desveto <texto receta>', aliases: [], handler: cmdDesveto },
  receta: { usage: '/receta <texto>', aliases: [], handler: cmdReceta },
  ayuda: { usage: '/ayuda', aliases: ['help'], handler: () => Promise.resolve(AYUDA) },
}

// alias normalizado → nombre canónico ("mañana"/"añade" llegan ya sin tildes vía norm)
const ALIAS_TO_CMD: Record<string, string> = {}
for (const [name, cmd] of Object.entries(COMMANDS)) {
  ALIAS_TO_CMD[name] = name
  for (const a of cmd.aliases) ALIAS_TO_CMD[a] = name
}

// ---------------------------------------------------------------------------
// Enrutado de mensajes
// ---------------------------------------------------------------------------

async function handleMessage(chatId: number, rawText: string): Promise<string> {
  const tokens = rawText.trim().split(/\s+/)
  // primer token: sin '/', sin sufijo @bot, lowercase y sin tildes
  const first = norm(tokens[0].replace(/^\//, '').replace(/@\S+$/, ''))
  const arg = tokens.slice(1).join(' ')

  // /start y /ayuda funcionan sin vincular
  if (first === 'start') return await cmdStart(chatId, tokens[1] ?? null)
  const cmdName = ALIAS_TO_CMD[first]
  if (!cmdName) return AYUDA // entrada no reconocida: nunca interpretar
  if (cmdName === 'ayuda') return AYUDA

  const userId = await linkedUser(chatId)
  if (!userId) {
    return 'CHAT SIN VINCULAR\n\nAbre tu perfil en la app, copia el código y mándame:\n/start &lt;código&gt;'
  }
  const householdId = await householdOf(userId)
  if (!householdId) return 'NO TIENES HOGAR. Crea o únete a uno desde la app primero.'

  return await COMMANDS[cmdName].handler({ chatId, userId, householdId, arg })
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

/* setMyCommands — registrar una vez con:
curl "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H 'Content-Type: application/json' \
  -d '{"commands": [
    { "command": "hoy",      "description": "Comidas de hoy" },
    { "command": "manana",   "description": "Comidas de mañana" },
    { "command": "semana",   "description": "Plan de la semana" },
    { "command": "quien",    "description": "Quién cocina" },
    { "command": "compra",   "description": "Lista de la compra" },
    { "command": "apunta",   "description": "Añadir a la lista" },
    { "command": "marca",    "description": "Marcar comprado" },
    { "command": "despensa", "description": "Ver la despensa" },
    { "command": "guarda",   "description": "Añadir a la despensa" },
    { "command": "caduca",   "description": "Caducidades próximas" },
    { "command": "cocinada", "description": "Marcar comida cocinada" },
    { "command": "nota",     "description": "Puntuar receta" },
    { "command": "receta",   "description": "Ficha de receta" },
    { "command": "ayuda",    "description": "Referencia de comandos" }
  ]}'
*/
