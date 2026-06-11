# Design — Iteración 4

## Context

Estado actual relevante:

- **OCR de tickets** (`src/lib/ticketOcr.ts`): tesseract.js 100% local con un
  parser heurístico genérico de tickets españoles. Se usa desde Pantry para
  poblar la despensa con caducidades estimadas. Extrae nombre+precio por línea
  y el total, pero el precio por línea se descarta.
- **Presupuesto**: `households.weekly_budget` y `shopping_lists.actual_cost`
  (iteración 3). No hay precios por ingrediente.
- **Macros como patrón**: `src/lib/macros.ts` deriva nutrición de
  `recipe_ingredients` × `ingredients`; nada almacenado. El coste debe seguir
  el mismo patrón.
- **Catálogo**: 320 recetas globales con `recipes.image_url` vacío. Existe
  `SpoonacularImport.tsx` + `src/lib/importers/spoonacular.ts` y
  `VITE_SPOONACULAR_KEY`.
- **Plan**: `meal_entries` con `cooked_at` (se marca desde Hoy) y
  `entry_type` (`meal_entry_type`, default `normal`). `pantry_items` con
  `expires_on` e `ingredients.typically_frozen`.
- **Push/cron**: `send-push` (tipos `weekly-plan`, `expiry`, `defrost`)
  protegida por `PUSH_CRON_SECRET`, programada en `008_push_cron.sql`
  (pg_cron + pg_net). Bot de Telegram v2 con router determinista.
- **CLI**: `scripts/pdh.mjs` con vía REST (usuario) y vía Management API
  (directo a BD, `recipes:seed`).

## Goals / Non-Goals

**Goals:**

- Capturar precio por ingrediente y supermercado desde el ticket ya escaneado,
  sin proveedores externos ni pasos extra para el usuario (solo elegir súper).
- Derivar coste por receta y coste previsto de la semana, comparando cadenas.
- Dar imagen a todo el catálogo global con un script re-ejecutable.
- Registrar y reaprovechar sobras con la mínima fricción (un gesto al marcar
  cocinado).
- Convertir el push dominical en un digest único y accionable (push + Telegram).

**Non-Goals:**

- Scraping de precios online de los supermercados (solo tickets reales).
- Predicción de inflación o histórico con gráficas (solo último precio + media).
- Subida de fotos propias por receta desde la app (solo poblado batch del
  catálogo global; las recetas de hogar quedan con fallback editorial).
- Caducidad de sobras con notificaciones propias (se apoya en el push de
  caducidades existente vía despensa).

## Decisions

### D1. Precios: tablas `supermarkets` + `ingredient_prices`

```sql
create table supermarkets (
  id smallint primary key,
  name text not null unique,        -- 'Día', 'Lidl', 'Mercadona'
  slug text not null unique         -- 'dia', 'lidl', 'mercadona'
);

create table ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  ingredient_id integer not null references ingredients(id) on delete cascade,
  supermarket_id smallint not null references supermarkets(id),
  price numeric not null check (price > 0),       -- € por unidad de compra
  quantity numeric,                                -- cantidad del envase si se detecta
  unit text,                                       -- unidad del envase
  seen_on date not null default current_date,
  source text not null default 'ticket',           -- 'ticket' | 'manual'
  created_at timestamptz not null default now()
);
```

- Histórico por hogar (RLS por membresía, como todo): los precios de mi súper
  no son un dato global fiable.
- `supermarkets` es catálogo fijo de solo lectura (sin household_id), ampliable
  por migración. Alternativa descartada: enum — una tabla permite añadir cadena
  sin migración de tipo y guardar metadatos (slug para el parser).
- Precio "vigente" = el más reciente por (ingrediente, súper). Vista
  `current_prices` con `distinct on` para no recalcular en cliente.

### D2. Parsers por cadena como refinamiento, no reescritura

`ticketOcr.ts` mantiene el parser genérico; se añade una capa de detección de
cadena (palabras clave en cabecera: "DIA", "LIDL", "MERCADONA") y un módulo de
ajustes por cadena (formato de línea, cantidad×precio en línea siguiente en
Mercadona, descuentos de Lidl). El usuario confirma/elige el súper en la UI de
escaneo (autodetectado como sugerencia). Cada línea emparejada con ingrediente
del catálogo genera un `ingredient_prices`. Alternativa descartada: un parser
por cadena desde cero — duplicaría el 80% de heurísticas comunes.

### D3. Coste derivado: `src/lib/costs.ts` espejo de `macros.ts`

Funciones puras: `recipeCost(recipe, prices)` → coste por receta y ración
usando el precio vigente del súper elegido (o el mínimo entre cadenas);
`weekCost(entries, prices)` → coste previsto de la semana. Conversión de
unidades reutilizando `grams_per_unit` (mismas reglas que macros). Ingredientes
sin precio → coste parcial con indicador de cobertura («coste basado en 8/11
ingredientes»). Nada se escribe en `recipes.estimated_cost` (la columna existe
pero queda como legacy/manual; las pantallas usan el derivado).

### D4. Fotos: comando `pdh recipes:photos` con dos fuentes y dry-run

- Fuente 1: Spoonacular (`VITE_SPOONACULAR_KEY` ya en `.env`) buscando por
  nombre traducido/simplificado; se acepta match con score mínimo (evitar fotos
  absurdas en recetas muy españolas).
- Fuente 2 (fallback): sin red — `image_url` queda null y la UI pinta un
  placeholder editorial por `main_ingredient` (bloque de color del sistema +
  inicial en Fraunces), de modo que el catálogo se ve bien aunque el matching
  falle. Alternativa descartada: generar imágenes con IA — coste y licencias.
- El comando escribe por la vía Management API (como `recipes:seed`), es
  idempotente (`--only-missing` por defecto, `--force` para repoblar) y tiene
  `--dry-run` que lista los matches propuestos sin escribir.
- UI: `<RecipeImage>` componente único (aspect ratio fijo, `loading="lazy"`,
  fallback editorial) usado en Recipes (card), RecipeDetail (cabecera) y Hoy
  (portada). El service worker cachea imágenes con stale-while-revalidate.

### D5. Sobras: columna en origen + entrada enlazada al consumir

- Registro: `meal_entries.leftover_servings numeric` — al marcar cocinado en
  Hoy, un stepper opcional «¿sobró algo?» (0 por defecto, sin fricción).
- Consumo: planificar una sobra crea un `meal_entry` con `entry_type =
  'sobras'` (nuevo valor del enum `meal_entry_type`) y `source_entry_id uuid`
  referenciando el origen; al crearla se descuenta de `leftover_servings`.
- Disponibilidad = `leftover_servings` menos lo ya consumido, con ventana de
  frescura: 3 días desde `cooked_at` (o más si `typically_frozen` y el usuario
  marcó «congelada» — boolean `frozen` en el origen).
- Hoy y Planner muestran las sobras disponibles como sugerencia prioritaria.
  El recomendador NO cambia: las sobras se ofrecen en la UI antes de pedir
  recomendación (mantener el recommender puro y sin conceptos nuevos).
  Alternativa descartada: tabla `leftovers` separada — más joins y RLS para el
  mismo dato; la sobra es un atributo de la comida cocinada.

### D6. Digest dominical: enriquecer `weekly-plan` en `send-push`

- El tipo `weekly-plan` de `send-push` pasa de «¿semana sin planificar?» a
  digest completo: menú de la semana entrante (por día/slot), coste previsto
  (D3, si hay precios), descongelados del lunes y si la lista de la compra está
  sin generar. Mismo cron (domingo 17:00 UTC), mismo secret.
- El mismo payload se envía por Telegram a los `telegram_links` del hogar
  (formato Markdown del bot); el bot gana el comando `/semana` que devuelve el
  digest bajo demanda.
- La lógica de composición vive en la Edge Function (Deno) consultando con
  service role; no se duplica en cliente. El coste se calcula con una versión
  mínima de las funciones de D3 portada a la función (sin imports del front).
  Riesgo de divergencia asumido y acotado: solo suma precios vigentes.

## Risks / Trade-offs

- [OCR impreciso en líneas de ticket] → el matching exige todas las palabras
  del ingrediente; precios solo de líneas con match firme + pantalla de
  confirmación editable antes de guardar.
- [Matching Spoonacular mete fotos incorrectas] → `--dry-run` revisable, score
  mínimo, y `--force` por receta individual para corregir; fallback editorial
  digno hace aceptable un match ratio bajo.
- [Divergencia coste front (TS) / digest (Deno)] → la función del digest solo
  agrega precios vigentes (consulta SQL), sin replicar conversiones complejas;
  si un día difieren, el front es la fuente de verdad visible.
- [Enum `meal_entry_type` + valor nuevo] → `alter type ... add value` es
  irreversible pero inocuo; los selects existentes no filtran por tipo.
- [Sobras y raciones fraccionadas] → `numeric`, el stepper va de 0.5 en 0.5.

## Migration Plan

1. Migración `011_iteration4.sql`: `supermarkets` + seed (Día/Lidl/Mercadona),
   `ingredient_prices` + RLS + vista `current_prices`, `alter type
   meal_entry_type add value 'sobras'`, columnas `leftover_servings`, `frozen`,
   `source_entry_id` en `meal_entries`.
2. Desplegar `send-push` y `telegram-bot` actualizadas (`supabase functions
   deploy`); el cron 008 no cambia de horario.
3. Ejecutar `pdh recipes:photos --dry-run`, revisar, ejecutar en real.
4. Front: deploy normal por GitHub Pages.

Rollback: las tablas/columnas nuevas son aditivas; desactivar UI basta. El
valor de enum no se revierte (inofensivo).

## Open Questions

- ¿Las recetas muy locales (pipirrana, andrajos) tendrán match decente en
  Spoonacular o irán casi todas a fallback? Se decide tras el primer
  `--dry-run` (criterio: si el match ratio < 40%, buscar fuente alternativa
  tipo Wikimedia en una iteración posterior).
- Hora del digest: 17:00 UTC fijo como hoy, ¿o configurable por hogar? Se deja
  fijo en esta iteración.
