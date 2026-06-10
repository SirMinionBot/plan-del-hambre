# Design: mvp-plan-del-hambre

## Context

Proyecto greenfield inspirado en calendario-dietas (React+TS+Vite+Supabase, mono-usuario). El scaffold ya existe: Vite + React 19 + TS, Tailwind 4 con tokens brutalistas en `src/index.css`, y `supabase/migrations/001_initial.sql` con el schema completo (households, ratings/vetos, calendario con raciones por persona, despensa, compra, plantillas, push). Usuarios objetivo: una pareja concreta — dos cuentas, dos móviles, un hogar.

## Goals / Non-Goals

**Goals:**
- App usable por dos personas con datos compartidos (hogar) y personales (gustos, macros) bien separados por RLS.
- Recomendador semanal **explicable**: cada sugerencia muestra su desglose de puntuación.
- Catálogo seed amplio (~250 recetas ES) sin depender de servicios de pago.
- Identidad brutalista consistente implementada como tokens + utilidades Tailwind, sin librería de componentes.
- PWA instalable con push para el recordatorio dominical y caducidades.

**Non-Goals:**
- Hogares de >2 miembros (el modelo lo permite, la UI no lo contempla).
- Seguimiento nutricional clínico (no hay micronutrientes ni validación dietética).
- Inventario de despensa con cantidades o descuento automático al cocinar.
- Recomendación con ML/embeddings; el scoring es heurístico y determinista.
- App nativa; solo PWA.

## Decisions

1. **Supabase como backend completo** (Auth + Postgres/RLS + Realtime + Edge Functions) — evita servidor propio; Realtime da la sincronización de checkboxes de compra gratis. Alternativa descartada: local-first PWA (sync entre dos personas demasiado costosa de hacer bien).

2. **RLS por membresía de hogar** vía funciones `security definer` (`is_household_member`, `my_household`) — una sola política por tabla del hogar, sin recursión de políticas. Las recetas seed tienen `household_id null` (legibles por todos, no editables).

3. **Raciones y divergencias en tabla satélite** `meal_entry_portions` (entry × user → servings + recipe override) en lugar de columnas duplicadas en `meal_entries`. Mantiene `unique(household, date, slot)` y modela "uno come otra cosa" sin filas fantasma en el calendario.

4. **Recomendador en cliente** (`src/lib/recommender.ts`, funciones puras): carga candidatas + historial de 10 días + despensa + lista en construcción, y puntúa `score = w·[gustoMin, variedad, temporada, macros, solapamientoCompra, contextoSlot, caducidades]`. Determinista y testeable con Vitest sin red. Alternativa descartada: Edge Function (latencia y fricción de desarrollo sin beneficio: los datos ya están en el cliente). Los pesos viven en un objeto exportado para ajustarlos sin tocar lógica.

5. **Veto y exclusiones filtran antes de puntuar** — el veto de cualquiera de los dos es absoluto; una exclusión de ingrediente elimina la receta completa. La explicación de score se materializa como `ScoreBreakdown[]` que la UI pinta tal cual (transparencia = rasgo brutalista).

6. **Seed por función PLpgSQL** `seed_recipe(jsonb)` en migración: cada receta es una llamada compacta con sus ingredientes por nombre; macros y coste se derivan de `ingredients`. Las ~250 recetas se reparten en migraciones por lotes (`003_seed_recipes_batch1.sql`, ...) para que sean revisables.

7. **Spoonacular como importador puntual, no sync**: módulo aislado (`src/lib/importers/spoonacular.ts`) que busca y convierte una receta a formato local, guardándola como receta del hogar. API key por `VITE_SPOONACULAR_KEY`; sin clave, la UI de importación no se muestra.

8. **PWA con `vite-plugin-pwa`** + Edge Function `send-push` (web-push, claves VAPID) + tabla `push_subscriptions`. Programación con `pg_cron` en Supabase (domingo 17:00 recordatorio si la semana siguiente está sin planificar; diario para caducidades a ≤2 días). Alternativa descartada: email (ignorable) y solo-banner (elegida también como fallback sin permiso de push).

9. **Estado en cliente: TanStack Query no, hooks propios sí** — el alcance es pequeño y la pareja de hooks `useHousehold`/`useWeek` con Realtime cubre el MVP; añadir una librería de caché es complejidad prematura. Se revisará si el invalidado manual duele.

## Risks / Trade-offs

- [RLS mal afinada expone datos del otro hogar] → tests de políticas con dos usuarios sintéticos antes de subir nada real; las funciones `security definer` centralizan la lógica.
- [El seed de 250 recetas con macros coherentes es mucho contenido manual] → generación por lotes con revisión; macros derivadas de ingredientes (una sola fuente de verdad); validación SQL de que toda receta tiene ≥3 ingredientes y kcal en rango plausible.
- [Push en iOS requiere instalación como PWA y tiene soporte irregular] → el banner in-app es el mecanismo primario; push es mejora progresiva.
- [Recomendador en cliente puede quedarse lento con catálogo grande] → 250 recetas × scoring O(n) es trivial; si el catálogo crece ×10, mover a Edge Function sin cambiar la función pura.
- [Spoonacular en inglés rompe la consistencia del catálogo] → las importadas se marcan `tags: ['importada']` y son editables; no entran en el catálogo global.

## Migration Plan

Proyecto nuevo: no hay migración de datos. Orden de despliegue: (1) proyecto Supabase + `001_initial.sql`, (2) seeds, (3) deploy estático (Vercel/Netlify/Pages), (4) Edge Function + VAPID + pg_cron al final (la app funciona sin push).

## Open Questions

- ¿Catálogo global editable por la pareja o solo "fork" a receta del hogar al modificar? (MVP: fork al editar.)
- Precios de ingredientes: ¿mantenerlos a mano o etiqueta de coste cualitativa (€/€€/€€€)? (MVP: numéricos aproximados, asumiendo imprecisión.)
- ¿pg_cron disponible en el plan gratuito de Supabase del usuario? Si no, el recordatorio dominical pasa a comprobación al abrir la app.
