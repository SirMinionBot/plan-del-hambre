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
- RLS por membresía de hogar (`is_household_member`). Las recetas/plantillas
  con `household_id null` son catálogo global de solo lectura: editar = fork.

## Sistema de diseño (brutalista — no negociable)

- Solo Space Mono; titulares en mayúsculas; cifras tabulares (`data-numeric`).
- Cero `border-radius`, cero sombras difusas. Utilidades: `border-brutal`,
  `border-brutal-thin`, `shadow-brutal[-sm|-lg]`, `press-brutal`, `blink-brutal`.
- Colores: `paper`, `ink`, `person-a` (rojo), `person-b` (azul), `warn`, `ok`.
  Todo dato de una persona lleva su color de acento.
- Estados tipográficos: errores en bloque negro/texto blanco, loading
  `CARGANDO...` parpadeante, vacíos en mayúsculas.

## Seeds SQL

- Nuevas recetas seed: llamadas a `seed_recipe($json$...$json$::jsonb)` con
  nombres de ingrediente EXACTOS de `002_seed_ingredients.sql`; terminar el
  fichero con `select validate_seed_recipes()`.
