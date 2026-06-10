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

## Sistema de diseño (soft UI — estilo Fireart "Custom Workout App")

- Manrope para todo; cifras tabulares (`data-numeric`). Sin mayúsculas en
  titulares (los micro-labels con clase `uppercase` actúan de overline).
- Fondo lavanda (`paper #f6f5fb`), texto azul noche (`ink #221c44`), primario
  violeta (`person-b #7c5cfc`, también acento de la persona B), coral
  (`person-a #ff7a59`, persona A y peligro). Todo dato de una persona lleva
  su color.
- Cards muy redondeadas con sombras difusas de color. Las utilidades
  HEREDAN LOS NOMBRES del sistema brutalista anterior: `border-brutal`
  (= card radius 1.5rem + borde sutil), `shadow-brutal[-sm|-lg]` (sombras
  suaves violetas), `press-brutal` (scale al pulsar), `blink-brutal` (pulse).
  Cambiar la estética = tocar `src/index.css`, no las pantallas.
- Botón primario: degradado violeta con texto blanco (`variant="primary"`).

## Seeds SQL

- Nuevas recetas seed: llamadas a `seed_recipe($json$...$json$::jsonb)` con
  nombres de ingrediente EXACTOS de `002_seed_ingredients.sql`; terminar el
  fichero con `select validate_seed_recipes()`.
