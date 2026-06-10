# Proposal: mvp-plan-del-hambre

## Why

Planificar las comidas de la semana en pareja es una negociación recurrente y tediosa: dos gustos distintos, dos objetivos nutricionales distintos, y una lista de la compra que alguien tiene que montar a mano. La app de referencia (calendario-dietas) resuelve el calendario individual, pero no modela al segundo miembro del hogar, no recomienda nada y su catálogo de recetas es testimonial.

**plan-del-hambre** es una nueva aplicación pensada desde cero para dos personas: hogar compartido, gustos y vetos individuales, recomendador de menús semanal transparente y un catálogo amplio de recetas en español — todo con una identidad visual brutalista.

## What Changes

- Proyecto nuevo (React + Vite + TS + Tailwind 4 + Supabase) con sistema de diseño brutalista propio (mono, papel/tinta, bordes 3px, sombras duras, un color de acento por persona).
- **Hogar de 2**: cuentas individuales vinculadas por código de invitación; calendario, recetas, despensa y compra pertenecen al hogar; objetivos y gustos son personales.
- **Calendario semanal** con slots desayuno/comida/cena, tipos de entrada (normal/fuera/cheat/evento/sobras), raciones asimétricas por persona, comidas divergentes (cada uno una receta) y cocinero asignado por slot.
- **Gustos y vetos**: rating 1-5 por persona, veto duro por receta, ingredientes excluidos por persona (alergias/manías). "Peticiones de la semana" ancladas antes de planificar.
- **Recomendador heurístico** que rellena la semana puntuando candidatas por gusto mínimo de ambos, variedad reciente, temporada, ajuste de macros, solapamiento de compra y contexto del slot — con explicación visible de cada puntuación y botón "otra".
- **Catálogo seed** de ~250 recetas en español con macros, etiquetas, temporada, batch y coste estimado. Importador opcional desde Spoonacular.
- **Lista de la compra** generada del plan, agrupada por pasillo, cantidades sumadas, checkboxes sincronizados en tiempo real entre los dos móviles.
- **Despensa** ligera (presencia + caducidad, sin cantidades): prioriza recetas que consumen lo que caduca y marca en la lista lo que ya hay.
- **Batch cooking**: recetas que rinden N días colocan "sobras" automáticamente y no duplican compra.
- **Histórico**: evolución de calorías/macros por persona vs objetivo y rachas/top recetas del hogar.
- **Plantillas de semana**: 4 de serie (gimnasio, fiambreras, semana rápida, libre) + propias + duplicar semanas pasadas; imponen restricciones por slot al recomendador.
- **PWA con push**: aviso de planificación dominical y caducidades próximas vía Web Push (service worker + Edge Function).

## Capabilities

### New Capabilities

- `design-system`: sistema de diseño brutalista (tokens, componentes base, layout de rejilla).
- `auth-household`: registro/login, creación de hogar e invitación por código, perfil con objetivos nutricionales por persona.
- `recipe-catalog`: CRUD de recetas e ingredientes, catálogo global seed (~250 recetas ES), ratings/vetos/exclusiones por persona, importador Spoonacular opcional.
- `meal-calendar`: calendario semanal del hogar con slots, tipos, raciones asimétricas, comidas divergentes, cocinero y marcado de "cocinada".
- `weekly-planner`: recomendador heurístico con scoring explicable, peticiones ancladas, batch/sobras y planificación de semana completa.
- `shopping-list`: lista de la compra agregada por pasillo con sync en tiempo real y descuento de despensa.
- `pantry`: despensa presencia+caducidad con avisos e integración con recomendador y compra.
- `household-stats`: histórico de macros por persona y rachas/top recetas.
- `week-templates`: plantillas de semana de serie y propias con restricciones por slot.
- `pwa-push`: PWA instalable con notificaciones push programadas.

### Modified Capabilities

(ninguna — proyecto nuevo, no hay specs previas)

## Impact

- Proyecto nuevo en `/home/remoteLab/proyectos/plan-del-hambre`; no toca otros proyectos.
- Backend: proyecto Supabase (Postgres + Auth + Realtime + Edge Functions). Migración `001_initial.sql` ya escrita (schema completo con RLS por membresía de hogar).
- Dependencias: `react-router-dom`, `@supabase/supabase-js`, `tailwindcss@4`; más adelante `vite-plugin-pwa` y `web-push` (Edge Function).
- Servicios externos: Spoonacular (opcional, API key en env, la app funciona sin ella); Web Push (claves VAPID).
