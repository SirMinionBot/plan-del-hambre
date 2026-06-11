# Tasks — Iteración 4

## 1. Base de datos (migración 011)

- [x] 1.1 Crear `supabase/migrations/011_iteration4.sql`: tabla `supermarkets`
      con seed (Día, Lidl, Mercadona) y `ingredient_prices` con RLS por hogar
      e índice por (household_id, ingredient_id, supermarket_id, seen_on desc)
- [x] 1.2 Vista `current_prices` (precio vigente por ingrediente/súper/hogar
      con `distinct on`)
- [x] 1.3 columnas (el enum ya incluía 'sobras' desde el MVP)
      `leftover_servings numeric`, `frozen boolean`, `source_entry_id uuid` en
      `meal_entries`
- [x] 1.4 Aplicar la migración en producción y regenerar tipos
      (`src/types/db.ts`)

## 2. Precios — captura desde ticket

- [x] 2.1 `ticketOcr.ts`: detección de cadena (Día/Lidl/Mercadona) por
      cabecera del ticket; devolver `supermarket_slug` en `TicketResult`
- [x] 2.2 Ajustes de parser por cadena (formato de líneas de Mercadona
      cantidad×precio, descuentos de Lidl) con tests en vitest sobre tickets
      de ejemplo en texto plano
- [x] 2.3 Extraer precio por línea emparejada (`TicketItem.price`) además del
      total
- [x] 2.4 UI de escaneo (Pantry): selector de súper preseleccionado con la
      detección, revisión editable de líneas+precios, guardado en
      `ingredient_prices`

## 3. Precios — coste derivado

- [x] 3.1 `src/lib/costs.ts` (espejo de `macros.ts`): `recipeCost` y
      `weekCost` puros con conversión por `grams_per_unit`, indicador de
      cobertura y comparativa entre súpers; tests en vitest
- [x] 3.2 Hook/fetch de `current_prices` en `useWeekData` o contexto propio
- [x] 3.3 RecipeDetail: coste por receta y ración con cobertura
- [x] 3.4 Planner: coste previsto de la semana junto a `weekly_budget` y
      comparativa «dónde sale más barato»

## 4. Fotos del catálogo

- [x] 4.1 `pdh recipes:photos`: matching Spoonacular con score mínimo,
      `--dry-run`, `--only-missing` (default) y `--force`; escribe
      `image_url` por Management API
- [ ] 4.2 Ejecutar `--dry-run`, revisar match ratio (criterio del design:
      <40% → anotar Open Question), ejecutar en real
      — PENDIENTE DE CUOTA: dry-run parcial hecho (20/40 matches, ~50%);
      la cuota diaria de Spoonacular se agotó. Re-ejecutar
      `node scripts/pdh.mjs recipes:photos` cuando renueve (las queries ya
      van limitadas a 2 conceptos para subir el ratio)
- [x] 4.3 Componente `<RecipeImage>` con lazy loading, proporción fija y
      fallback editorial por `main_ingredient`
- [x] 4.4 Integrar en Recipes (card), RecipeDetail (cabecera) y Today
      (portada); caché de imágenes en el service worker
      (stale-while-revalidate)

## 5. Sobras

- [x] 5.1 Today: stepper «¿sobró algo?» (pasos de 0.5) + toggle congelar al
      marcar cocinado
- [x] 5.2 Lógica pura de disponibilidad (registradas − consumidas, ventana 3
      días nevera / sin límite congeladas) en `src/lib/` con tests
- [x] 5.3 Today: aviso «tienes fiambrera de X (N raciones)» y sugerencia de
      congelar al agotar la ventana si `typically_frozen`
- [x] 5.4 SlotEditor/Planner: ofrecer sobras disponibles como opción
      prioritaria; al asignar, crear entrada `entry_type='sobras'` con
      `source_entry_id` y descontar raciones

## 6. Digest dominical

- [x] 6.1 `send-push`: tipo `weekly-plan` → digest completo (menú semana
      entrante, coste previsto desde `current_prices`, descongelados del
      lunes, lista sin generar); conservar el caso «semana sin planificar»
- [x] 6.2 Envío del mismo digest por Telegram a los `telegram_links` del hogar
- [x] 6.3 `telegram-bot`: comando `/semana` que responde el digest bajo
      demanda (reutilizar la composición de 6.1)
- [x] 6.4 Desplegar ambas funciones y verificar el flujo con una invocación
      manual protegida por `PUSH_CRON_SECRET`

## 7. Verificación

- [x] 7.1 `pnpm build`, `pnpm test` y lint a cero
- [ ] 7.2 Prueba manual: escanear ticket real de cada cadena, ver coste en
      planner, sobras de un día a otro, y digest recibido en push y Telegram
- [x] 7.3 Actualizar CLAUDE.md (módulo costs, comando recipes:photos, enum
      sobras) y SKILL.md del CLI
