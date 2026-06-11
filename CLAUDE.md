# CLAUDE.md — plan-del-hambre

## Comandos

- `pnpm dev` / `pnpm build` / `pnpm test` (vitest). Siempre pnpm, nunca npm.
- OpenSpec: artefactos en `openspec/changes/mvp-plan-del-hambre/`. Antes de
  implementar algo nuevo, revisa specs y marca tareas en `tasks.md`.

## Arquitectura

- React 19 + Vite + TS + Tailwind 4 (config CSS-first en `src/index.css`) + Supabase.
- Sin librería de componentes ni de estado: componentes propios en
  `src/components/ui/`, contextos en `src/hooks/` (`useAuth`, `useHousehold`,
  `useWeekData`).
- Lógica pura y testeable en `src/lib/` (recommender, macros, dates). El
  recomendador NO toca red: recibe todo por `PlannerContext`.
- Nutrición: las macros SIEMPRE se derivan de `recipe_ingredients` ×
  `ingredients` (`src/lib/macros.ts`); no hay kcal almacenadas en recetas.
- Coste: mismo patrón que las macros — `src/lib/costs.ts` lo deriva de
  `current_prices` (precios reales de tickets por súper: Día/Lidl/Mercadona,
  tablas `supermarkets`/`ingredient_prices`) con fallback a
  `estimated_price_per_100g`; nunca se almacena. El digest (Edge Functions)
  usa una versión mínima en `supabase/functions/_shared/digest.ts`.
- Sobras: atributo de la comida cocinada (`meal_entries.leftover_servings`,
  `frozen`); consumirlas crea una entrada `entry_type='sobras'` con
  `source_entry_id` y descuenta del origen. Lógica pura en
  `src/lib/leftovers.ts` (ventana de nevera: 3 días).
- Fotos del catálogo: `recipes.image_url` se puebla con
  `node scripts/pdh.mjs recipes:photos` (Spoonacular, `--dry-run` primero);
  la UI siempre pinta `<RecipeImage>` (fallback editorial, nunca hueco roto).
- RLS por membresía de hogar (`is_household_member`). Las recetas/plantillas
  con `household_id null` son catálogo global de solo lectura: editar = fork.

## Sistema de diseño (Editorial Gourmet — revista gastronómica)

- Titulares con serif de display **Fraunces** (`font-display`); cuerpo en
  **Manrope**; cifras tabulares (`data-numeric`). Sin mayúsculas en titulares;
  los micro-labels con clase `uppercase` actúan de overline en versalitas
  espaciadas. Fraunces y Manrope se cargan por `<link>` en `index.html`.
- Papel cálido (`paper #faf7f2`), texto espresso (`ink #2b2320`), primario
  oliva (`person-b #5f6f4e`, también acento de la persona B), terracota
  (`person-a #bf4733`, persona A y peligro). Todo dato de una persona lleva
  su color.
- Cards con reglas hairline finas, radio contenido y casi sin sombra: la
  profundidad la da el aire, no la elevación. Las utilidades CONSERVAN LOS
  NOMBRES de estilos anteriores (brutalista → soft UI → editorial):
  `border-brutal` (= card radius 0.75rem + hairline), `shadow-brutal[-sm|-lg]`
  (sombras casi imperceptibles), `press-brutal` (scale al pulsar),
  `blink-brutal` (pulse). Cambiar la estética = tocar `src/index.css`, no las
  pantallas.
- Botón primario: oliva sólido con texto blanco (`variant="primary"`,
  `bg-person-b`).

## Seeds SQL

- Nuevas recetas seed: llamadas a `seed_recipe($json$...$json$::jsonb)` con
  nombres de ingrediente EXACTOS de `002_seed_ingredients.sql`; terminar el
  fichero con `select validate_seed_recipes()`.
