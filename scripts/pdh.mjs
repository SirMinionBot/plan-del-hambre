#!/usr/bin/env node
// CLI de plan-del-hambre: opera contra Supabase autenticado como TU usuario
// (la RLS aplica igual que en la app). Credenciales en .env del proyecto:
//   PDH_EMAIL=...  PDH_PASSWORD=...
// Uso: node scripts/pdh.mjs <comando> [args]  (ver `help`)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SESSION_CACHE = '/tmp/pdh-session.json'

const env = {}
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const BASE = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY

function die(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

if (!BASE || !ANON) die('faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env')

async function login() {
  if (existsSync(SESSION_CACHE)) {
    const cached = JSON.parse(readFileSync(SESSION_CACHE, 'utf8'))
    if (cached.expires_at * 1000 > Date.now() + 60_000 && cached.email === env.PDH_EMAIL) return cached
  }
  if (!env.PDH_EMAIL || !env.PDH_PASSWORD) {
    die('faltan PDH_EMAIL / PDH_PASSWORD en .env (las credenciales de tu cuenta de la app)')
  }
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.PDH_EMAIL, password: env.PDH_PASSWORD }),
  })
  const data = await res.json()
  if (!res.ok) die(`login: ${data.error_description ?? data.msg ?? res.status}`)
  const session = {
    access_token: data.access_token,
    expires_at: data.expires_at,
    user_id: data.user.id,
    email: env.PDH_EMAIL,
  }
  writeFileSync(SESSION_CACHE, JSON.stringify(session))
  return session
}

async function rest(session, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) die(`${method} ${path} → ${res.status}: ${data?.message ?? text}`)
  return data
}

async function myHousehold(session) {
  const rows = await rest(session, `household_members?select=household_id&user_id=eq.${session.user_id}`)
  if (!rows.length) die('tu usuario no pertenece a ningún hogar')
  return rows[0].household_id
}

function mondayOf(date = new Date()) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

async function resolveIngredient(session, name) {
  const n = name.trim().toLowerCase()
  const rows = await rest(session, `ingredients?select=id,name,category_id,default_unit&name=eq.${encodeURIComponent(n)}`)
  return rows[0] ?? null
}

// --- comandos -------------------------------------------------------------

async function cmdWhoami() {
  const s = await login()
  const hid = await myHousehold(s)
  const [h] = await rest(s, `households?select=name,invite_code&id=eq.${hid}`)
  console.log(JSON.stringify({ email: s.email, user_id: s.user_id, hogar: h?.name, household_id: hid }, null, 2))
}

async function cmdRecipeAdd(args) {
  const fileIdx = args.indexOf('--file')
  const raw = fileIdx >= 0 ? readFileSync(args[fileIdx + 1], 'utf8') : readFileSync(0, 'utf8')
  const r = JSON.parse(raw)
  if (!r.nombre || !Array.isArray(r.ingredientes) || r.ingredientes.length === 0) {
    die('JSON inválido: necesita {nombre, ingredientes: [{n, q, u?}, ...]} como mínimo')
  }
  const s = await login()
  const hid = await myHousehold(s)

  const resolved = []
  const missing = []
  for (const ing of r.ingredientes) {
    const found = await resolveIngredient(s, ing.n)
    if (!found) missing.push(ing.n)
    else resolved.push({ ingredient_id: found.id, quantity: ing.q, unit: ing.u ?? found.default_unit })
  }
  if (missing.length) die(`ingredientes inexistentes en el catálogo: ${missing.join(', ')}`)

  const [recipe] = await rest(s, 'recipes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      household_id: hid,
      created_by: s.user_id,
      name: r.nombre,
      description: r.descripcion ?? null,
      instructions: r.instrucciones ?? null,
      servings: r.raciones ?? 2,
      prep_minutes: r.prep_min ?? 0,
      cook_minutes: r.cocina_min ?? 0,
      tags: r.tags ?? [],
      season: r.temporada ?? 'todo-el-ano',
      batch_days: r.batch_days ?? 1,
      main_ingredient: r.principal ?? null,
    },
  })
  await rest(s, 'recipe_ingredients', {
    method: 'POST',
    body: resolved.map((x) => ({ ...x, recipe_id: recipe.id })),
  })
  console.log(`OK receta creada: ${recipe.name} (${recipe.id}) con ${resolved.length} ingredientes`)
}

async function getList(session, week, { create = false } = {}) {
  const hid = await myHousehold(session)
  let [list] = await rest(session, `shopping_lists?select=id,week_start&household_id=eq.${hid}&week_start=eq.${week}`)
  if (!list && create) {
    ;[list] = await rest(session, 'shopping_lists', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { household_id: hid, week_start: week },
    })
  }
  return list ?? null
}

async function cmdShoppingShow(args) {
  const week = argValue(args, '--week') ?? mondayOf()
  const s = await login()
  const list = await getList(s, week)
  if (!list) return console.log(`(no hay lista para la semana del ${week})`)
  const items = await rest(s, `shopping_list_items?select=name,quantity,unit,category,checked,in_pantry&list_id=eq.${list.id}&order=category,name`)
  for (const i of items) {
    console.log(`${i.checked ? '[x]' : '[ ]'} ${i.name}${i.quantity ? ` — ${i.quantity} ${i.unit ?? ''}` : ''}${i.in_pantry ? ' (en despensa)' : ''}  · ${i.category ?? 'otros'}`)
  }
  console.log(`${items.length} ítems · semana del ${week}`)
}

async function cmdShoppingAdd(args) {
  const week = argValue(args, '--week') ?? mondayOf()
  const [name, qty, unit] = args.filter((a) => !a.startsWith('--') && a !== argValue(args, '--week'))
  if (!name) die('uso: shopping:add <nombre> [cantidad] [unidad] [--week YYYY-MM-DD]')
  const s = await login()
  const list = await getList(s, week, { create: true })
  const ing = await resolveIngredient(s, name)
  await rest(s, 'shopping_list_items', {
    method: 'POST',
    body: {
      list_id: list.id,
      ingredient_id: ing?.id ?? null,
      name: ing?.name ?? name.toLowerCase(),
      quantity: qty ? Number(qty) : null,
      unit: unit ?? ing?.default_unit ?? null,
      sort_order: 999,
    },
  })
  console.log(`OK añadido "${ing?.name ?? name}" a la lista del ${week}${ing ? '' : ' (texto libre, sin vincular al catálogo)'}`)
}

async function findItems(session, week, query) {
  const list = await getList(session, week)
  if (!list) die(`no hay lista para la semana del ${week}`)
  const items = await rest(session, `shopping_list_items?select=id,name,checked&list_id=eq.${list.id}&name=ilike.*${encodeURIComponent(query)}*`)
  if (!items.length) die(`ningún ítem coincide con "${query}"`)
  return items
}

async function cmdShoppingToggle(args, checked) {
  const week = argValue(args, '--week') ?? mondayOf()
  const query = args.filter((a) => !a.startsWith('--'))[0]
  if (!query) die('uso: shopping:check|uncheck <texto> [--week YYYY-MM-DD]')
  const s = await login()
  const items = await findItems(s, week, query)
  if (items.length > 1 && !args.includes('--all')) {
    die(`coincide con ${items.length} ítems (${items.map((i) => i.name).join(', ')}) — afina el texto o usa --all`)
  }
  for (const i of items) {
    await rest(s, `shopping_list_items?id=eq.${i.id}`, {
      method: 'PATCH',
      body: { checked, checked_by: checked ? s.user_id : null },
    })
  }
  console.log(`OK ${items.map((i) => i.name).join(', ')} → ${checked ? 'marcado' : 'desmarcado'}`)
}

async function cmdShoppingRemove(args) {
  const week = argValue(args, '--week') ?? mondayOf()
  const query = args.filter((a) => !a.startsWith('--'))[0]
  if (!query) die('uso: shopping:remove <texto> [--week YYYY-MM-DD]')
  const s = await login()
  const items = await findItems(s, week, query)
  if (items.length > 1 && !args.includes('--all')) {
    die(`coincide con ${items.length} ítems (${items.map((i) => i.name).join(', ')}) — afina el texto o usa --all`)
  }
  for (const i of items) await rest(s, `shopping_list_items?id=eq.${i.id}`, { method: 'DELETE' })
  console.log(`OK eliminado: ${items.map((i) => i.name).join(', ')}`)
}

async function cmdRecipeRate(args) {
  const veto = args.includes('--veto')
  const positional = args.filter((a) => !a.startsWith('--'))
  const rating = veto ? null : Number(positional.at(-1))
  const query = veto ? positional.join(' ') : positional.slice(0, -1).join(' ')
  if (!query || (!veto && !(rating >= 1 && rating <= 5))) die('uso: recipes:rate <nombre> <1-5> | recipes:rate <nombre> --veto')
  const s = await login()
  const recipes = await rest(s, `recipes?select=id,name&name=ilike.*${encodeURIComponent(query)}*&limit=5`)
  if (recipes.length !== 1) {
    die(recipes.length === 0 ? `ninguna receta coincide con "${query}"` : `coincide con varias: ${recipes.map((r) => r.name).join(' | ')}`)
  }
  await rest(s, 'recipe_ratings', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: { user_id: s.user_id, recipe_id: recipes[0].id, rating, vetoed: veto },
  })
  console.log(`OK ${recipes[0].name} → ${veto ? 'VETADA' : `rating ${rating}`}`)
}

function argValue(args, flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const HELP = `pdh — CLI de plan-del-hambre (autenticado como tu usuario, RLS aplica)

  whoami                                   quién soy y mi hogar
  recipes:add --file receta.json          crear receta del hogar (o JSON por stdin)
  recipes:rate <nombre> <1-5> [--veto]    puntuar/vetar receta
  shopping:show [--week YYYY-MM-DD]       ver la lista de la compra
  shopping:add <nombre> [cant] [unidad]   añadir ítem (vincula al catálogo si existe)
  shopping:check <texto> [--all]          marcar comprado
  shopping:uncheck <texto> [--all]        desmarcar
  shopping:remove <texto> [--all]         eliminar ítem

Formato JSON de receta (igual que los seeds):
  {"nombre": "...", "descripcion": "...", "instrucciones": "paso\\npaso",
   "raciones": 2, "prep_min": 10, "cocina_min": 20, "tags": ["rapida"],
   "temporada": "todo-el-ano", "batch_days": 1, "principal": "pollo",
   "ingredientes": [{"n": "pechuga de pollo", "q": 300, "u": "g"}]}`

const [cmd, ...rest_] = process.argv.slice(2)
const commands = {
  whoami: cmdWhoami,
  'recipes:add': cmdRecipeAdd,
  'recipes:rate': cmdRecipeRate,
  'shopping:show': cmdShoppingShow,
  'shopping:add': cmdShoppingAdd,
  'shopping:check': (a) => cmdShoppingToggle(a, true),
  'shopping:uncheck': (a) => cmdShoppingToggle(a, false),
  'shopping:remove': cmdShoppingRemove,
}
if (!cmd || cmd === 'help' || !commands[cmd]) {
  console.log(HELP)
  process.exit(cmd && cmd !== 'help' ? 1 : 0)
}
commands[cmd](rest_).catch((e) => die(e.message))
