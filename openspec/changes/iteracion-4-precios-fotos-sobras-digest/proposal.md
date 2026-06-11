# Iteración 4 — precios por súper, fotos del catálogo, sobras y digest dominical

## Why

La app ya planifica, recomienda y genera la compra, pero el dato económico muere
en el ticket (el OCR lee líneas y solo aprovecha el total), el catálogo de ~320
recetas no tiene ni una foto (el diseño Editorial Gourmet pide imagen), las
raciones que sobran se pierden (desperdicio y comidas no aprovechadas) y los
push existentes son avisos sueltos en lugar de un resumen accionable. Estas
cuatro mejoras cierran bucles ya empezados: OCR→precios, catálogo→imagen,
plan→sobras, cron→digest.

## What Changes

- **Precios reales por supermercado**: parsers de ticket específicos por cadena
  (Día, Lidl, Mercadona) sobre el OCR local existente; histórico de precios por
  ingrediente y supermercado; coste estimado por receta SIEMPRE derivado de
  `recipe_ingredients` × precios (como las macros, nunca almacenado); coste
  previsto de la semana al planificar y comparativa «dónde sale más barato».
- **Fotos del catálogo**: script batch (`pdh recipes:photos`) que rellena
  `recipes.image_url` para las recetas globales vía matching con Spoonacular y
  fallback editorial por `main_ingredient`; las pantallas Recipes, RecipeDetail
  y Hoy muestran imagen respetando el diseño editorial.
- **Gestión de sobras**: al completar una comida se pueden registrar raciones
  sobrantes; aparecen como sugerencia destacada en el planner y en la página
  Hoy («tienes fiambrera de lentejas»), con aviso de congelar apoyado en
  `typically_frozen` si no se van a consumir pronto.
- **Digest dominical**: el push dominical existente («semana sin planificar»)
  se convierte en un digest completo por push y Telegram: menú de la semana
  entrante, coste estimado (sinergia con precios), qué descongelar el primer
  día y recordatorio de generar la compra.

Sin cambios breaking: todo es aditivo sobre tablas y funciones existentes.

## Capabilities

### New Capabilities

- `price-tracking`: captura de precios desde tickets por supermercado,
  histórico por ingrediente y súper, coste derivado por receta y predicción de
  coste semanal con comparativa entre cadenas.
- `recipe-images`: poblado batch de `image_url` del catálogo global y
  presentación de imágenes en las pantallas de recetas y portada.
- `leftovers`: registro de raciones sobrantes al completar comidas y su
  reaprovechamiento en planner/Hoy con aviso de congelado.
- `weekly-digest`: resumen dominical accionable de la semana entrante enviado
  por push y Telegram desde el cron existente.

### Modified Capabilities

<!-- Las specs principales aún no están sincronizadas (viven como deltas en
     mvp-plan-del-hambre); las cuatro funcionalidades se modelan como
     capacidades nuevas que se apoyan en las existentes sin cambiar sus
     requisitos. -->

(ninguna)

## Impact

- **BD**: tablas nuevas `supermarkets` (catálogo fijo: Día, Lidl, Mercadona) y
  `ingredient_prices` (histórico por ingrediente/súper); columna nueva en
  `meal_entries` o tabla `leftovers` para sobras; `recipes.image_url` ya existe
  (solo se rellena). RLS por hogar en lo nuevo.
- **Frontend**: `src/lib/ticketOcr.ts` (detección de cadena + parsers),
  `src/lib/` nuevo módulo de costes (espejo de `macros.ts`), Shopping (selector
  de súper al escanear, coste previsto), Planner/Today (sobras, coste semana),
  Recipes/RecipeDetail/Today (imágenes).
- **Backend**: Edge Function `send-push` (tipo `weekly-digest` enriquecido),
  `telegram-bot` (comando/envío del digest), cron 008 actualizado.
- **Tooling**: `scripts/pdh.mjs` nuevo comando `recipes:photos`
  (`VITE_SPOONACULAR_KEY` ya está en `.env`).
- **Dependencias**: ninguna nueva (tesseract.js, Spoonacular y VAPID ya están).
