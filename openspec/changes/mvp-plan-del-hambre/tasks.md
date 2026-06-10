# Tasks: mvp-plan-del-hambre

## 14. Iteración 4 (rediseño visual)

- [x] 14.1 Migración del sistema de diseño brutalista a soft UI (referencia: Fireart "Custom Workout App"): tokens y utilidades redefinidos en index.css conservando nombres, Manrope, paleta lavanda/violeta/coral, cards redondeadas con sombra difusa, botón primario degradado, nav tipo píldora, iconos PWA y manifest actualizados, spec design-system reescrita

## 1. Cimientos (parcialmente hecho durante el descubrimiento)

- [x] 1.1 Scaffold Vite + React + TS con pnpm, Tailwind 4, react-router-dom y @supabase/supabase-js
- [x] 1.2 Sistema de diseño brutalista en `src/index.css` (tokens @theme + utilidades border/shadow/press/blink)
- [x] 1.3 Migración `supabase/migrations/001_initial.sql`: schema completo con enums, hogar, recetas, calendario+porciones, despensa, compra, plantillas, push y RLS
- [x] 1.4 Componentes base brutalistas: Button, Input, Select, Banner (error/aviso), EmptyState, Tag
- [x] 1.5 Cliente Supabase (`src/lib/supabase.ts`), tipos de dominio (`src/types/db.ts`), `.env.example`
- [x] 1.6 Shell de la app: Layout con navegación de rejilla, rutas (login, calendario, recetas, despensa, compra, estadísticas, plantillas, perfil)
- [x] 1.7 README del proyecto + CLAUDE.md local (pnpm, openspec, convenciones del design system)

## 2. Auth y hogar

- [x] 2.1 Registro/login con Supabase Auth y página de perfil (nombre, objetivos kcal/macros)
- [x] 2.2 Flujo de hogar: crear hogar, mostrar código, unirse por código, asignación de acento a/b (RPCs `create_household`/`join_household`)
- [x] 2.3 Hook `useHousehold` (miembro actual, pareja, hogar) y guard de rutas sin hogar
- [x] 2.5 Recuperación de contraseña: "he olvidado la contraseña" en login (resetPasswordForEmail) + ruta /reset para fijar la nueva (requiere la URL de Pages en Redirect URLs de Supabase)
- [x] 2.4 Test de RLS con usuarios sintéticos contra el proyecto real (transacción con rollback): aislamiento entre hogares (lectura y escritura), pareja lee ratings pero no los modifica, catálogo global legible y no editable — 9/9 PASS

## 3. Catálogo de recetas e ingredientes

- [x] 3.1 Seed de categorías e ingredientes (200, surtido Día/Lidl, con macros y precio aproximado) en `002_seed_ingredients.sql`
- [x] 3.2 Función PLpgSQL `seed_recipe(jsonb)` + validador (`003_seed_recipe_fn.sql`) y primer lote de 80 recetas (`004`)
- [x] 3.3 Lotes restantes hasta 250 recetas (005: 85, 006: 85) con validación de macros plausibles (cross-check local: 0 errores, kcal/ración 80-1500)
- [x] 3.4 Listado de recetas con filtros (etiqueta, tiempo, búsqueda) y detalle con macros por ración y coste
- [x] 3.5 CRUD de recetas del hogar + fork al editar una seed ("Copiar al hogar")
- [x] 3.6 Ratings 1-5 y veto por persona desde el detalle; exclusiones de ingredientes en el perfil

## 4. Calendario

- [x] 4.1 Vista semanal como tabla 7×3 brutalista con colores de persona
- [x] 4.2 Edición de slot: receta, tipo de entrada, cocinero, notas, anclado (petición)
- [x] 4.3 Raciones asimétricas y comidas divergentes (meal_entry_portions)
- [x] 4.4 Marcar cocinada + balance semanal de cocineros en cabecera
- [x] 4.5 Resumen diario de kcal por persona al pie de cada columna

## 5. Recomendador y planificación semanal

- [x] 5.1 `src/lib/recommender.ts`: filtros duros (veto, exclusiones) + scoring puro con pesos exportados y `ScoreBreakdown`
- [x] 5.2 Tests Vitest del recomendador — 10/10 pasando
- [x] 5.3 Planificación de semana completa respetando anclados y plantilla activa; colocación automática de `sobras` para batch_days > 1
- [x] 5.4 UI de planificación: propuesta por slot con desglose visible ("¿por qué?") y botón "otra"

## 6. Lista de la compra

- [x] 6.1 Generación desde el plan (agregación por ingrediente y pasillo, escala por raciones, sobras no duplican)
- [x] 6.2 Checkboxes sincronizados con Supabase Realtime y autor del check (color de persona)
- [x] 6.3 Marcado "ya en despensa" y coste estimado total

## 7. Despensa

- [x] 7.1 CRUD de ítems (nombre, ingrediente opcional, caducidad)
- [x] 7.2 Banner de caducidades ≤48h al abrir la app (en Layout)
- [x] 7.3 Bonus de caducidad en el recomendador con desglose

## 8. Plantillas de semana

- [x] 8.1 Seed de 4 plantillas de serie con slots (`007_seed_templates.sql`)
- [x] 8.2 Selector de plantilla al planificar + aplicación de restricciones por slot
- [x] 8.3 Crear plantilla propia (guardar semana como plantilla) y duplicar semana pasada

## 9. Histórico

- [x] 9.1 Evolución de kcal medias diarias por persona vs objetivo (8 semanas, barras con raya de objetivo)
- [x] 9.2 Rachas de semanas planificadas, top recetas cocinadas y comodines del mes

## 10. PWA y push

- [x] 10.1 vite-plugin-pwa (injectManifest): manifest brutalista, sw propio con precache, instalable
- [x] 10.2 Suscripción push desde perfil + tabla push_subscriptions; fallback a banners si se deniega
- [x] 10.3 Edge Function `send-push` (web-push + VAPID) y SQL de programación pg_cron (`008_push_cron.sql`) — falta desplegar y poner secrets (acción del usuario)

## 13. Iteración 3 (bot, presupuesto, ticket, descongelar, atajos, offline)

- [x] 13.1 Migración 009: weekly_budget, actual_cost, typically_frozen, telegram_links + telegram_link_code
- [x] 13.2 Bot de Telegram (Edge Function `telegram-bot`): vinculación por código, hoy/mañana/compra/añade/marca/despensa, secret token, filtrado por hogar
- [x] 13.3 Escáner de tickets 100% LOCAL (tesseract.js en el dispositivo + parser heurístico + matching con el catálogo): productos a despensa con caducidad estimada por pasillo, nombres editables, y total como coste real de la semana; sin proveedores externos, offline tras el primer uso
- [x] 13.4 Push "saca del congelador" (type defrost en send-push + cron 20:00 + flag typically_frozen)
- [x] 13.5 Presupuesto semanal del hogar (perfil) + comparación en compra + modo "semana barata" en el planificador (componente de coste en el recomendador, 12/12 tests)
- [x] 13.6 Atajos PWA (long-press del icono → Compra / Planificar / Despensa)
- [x] 13.7 Modo offline: NetworkFirst para datos de Supabase + caché de fuentes + banner de sin conexión (lectura offline; escritura avisa)
- [x] 13.8 Bot v2 determinista: router de comandos exacto con alias, validación con sintaxis por comando, resolución única-o-lista, y cobertura completa (semana, quien, desmarca/quita, despensa/guarda/gastado/caduca, cocinada, nota/veto/desveto, receta) + setMyCommands

## 12. Iteración 2 (feedback de uso real)

- [x] 12.1 Valoración exprés "¿repetiríamos?" (1-5, descartable) al marcar cocinada, en Hoy y Calendario
- [x] 12.2 Calibración speed-dating: ~24 recetas variadas por ingrediente principal con veto/meh/sí/favorita + aviso en Hoy con <10 valoraciones + enlace en perfil
- [x] 12.3 Pantalla HOY como inicio (comidas del día, cocinero, raciones, kcal vs objetivo, CTA planificar si vacía); calendario pasa a /calendario

## 11. Extras

- [x] 11.3 Picker buscable a pantalla completa (filtro sin tildes, texto libre opcional) en lugar de select/datalist para recetas e ingredientes: SlotEditor (receta + divergentes), RecipeForm (con unidad por defecto), exclusiones del perfil y despensa
- [x] 11.1 Importador Spoonacular detrás de `VITE_SPOONACULAR_KEY` (buscar, convertir, guardar como receta del hogar `importada`)
- [ ] 11.2 Verificación final: `pnpm build` ✓, tests ✓, migraciones aplicadas en producción ✓ (200 ing / 250 recetas / 4 plantillas), RLS ✓, desplegado en GitHub Pages ✓ — falta lighthouse PWA y prueba manual desde el móvil (crear hogar, invitar, planificar)
