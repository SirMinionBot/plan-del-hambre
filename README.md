# PLAN DEL HAMBRE

Qué comemos esta semana, sin discutir. Planificador semanal de comidas para una
pareja: hogar compartido, gustos y vetos individuales, recomendador heurístico
explicable, lista de la compra en tiempo real y despensa con caducidades.
Diseño brutalista sin disculpas.

React 19 + TypeScript + Vite + Tailwind 4 + Supabase. PWA instalable con Web Push.

## Arranque

```bash
pnpm install
cp .env.example .env   # rellena URL y anon key de tu proyecto Supabase
pnpm dev
```

## Base de datos

Aplica las migraciones de `supabase/migrations/` **en orden** (SQL Editor del
dashboard o `supabase db push` con el CLI vinculado):

| Fichero | Qué hace |
|---|---|
| `001_initial.sql` | Schema completo: hogar+invitación, recetas, calendario con raciones por persona, despensa, compra, plantillas, push. RLS por membresía y RPCs `create_household`/`join_household` |
| `002_seed_ingredients.sql` | 200 ingredientes (surtido Día/Lidl) con macros y precio aproximado |
| `003_seed_recipe_fn.sql` | Función `seed_recipe(jsonb)` + validador de plausibilidad |
| `004..006_seed_recipes_*.sql` | 250 recetas en español (desayunos/rápidas, diario/batch, pescado/veggie/finde) |
| `007_seed_templates.sql` | 4 plantillas de semana de serie |
| `008_push_cron.sql` | Programación pg_cron de los push (requiere editar `<PROJECT_REF>`/`<ANON_KEY>`) |

## Cómo funciona el recomendador

`src/lib/recommender.ts` — funciones puras, deterministas y testeadas
(`pnpm test`). Vetos y exclusiones de ingredientes de **cualquiera de los dos**
filtran antes de puntuar; después, suma ponderada (pesos en `WEIGHTS`):

gusto mínimo de la pareja · variedad (10 días) · temporada · ajuste de macros ·
solapamiento con la compra · contexto del slot (rápida entre semana) ·
rescate de caducidades de despensa

Cada sugerencia expone su desglose en la UI (botón "¿por qué?") y tiene
alternativa con un toque (botón "otra"). Las recetas `batch_days > 1` colocan
SOBRAS automáticamente al día siguiente.

## Push (opcional)

```bash
npx web-push generate-vapid-keys
# pública → VITE_VAPID_PUBLIC_KEY en .env (y en Vercel/Netlify)
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email
# después ejecuta 008_push_cron.sql con tus valores
```

Sin push todo funciona igual: los avisos salen como banners al abrir la app.

## Importador Spoonacular (opcional)

Con `VITE_SPOONACULAR_KEY` en `.env` aparece "Importar" en Recetas. Las
importadas llegan en inglés, se guardan como recetas del hogar con etiqueta
`importada` y son editables.

## Scripts

```bash
pnpm dev / pnpm build / pnpm preview
pnpm test        # vitest (recomendador)
```

## Trazabilidad

El proyecto se desarrolla con [OpenSpec](https://github.com/Fission-AI/OpenSpec):
specs por capability, decisiones de diseño y tareas en
`openspec/changes/mvp-plan-del-hambre/`.

## Bot de Telegram (opcional)

1. Crea un bot con [@BotFather](https://t.me/BotFather) (`/newbot`) y guarda el token.
2. Despliega la función y configura los secrets:

```bash
supabase functions deploy telegram-bot --no-verify-jwt
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=<aleatorio>
```

3. Registra el webhook (mismo `<aleatorio>` que el secret):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-bot" \
  -d "secret_token=<aleatorio>"
```

4. Vincula tu cuenta: copia el código de Telegram desde tu perfil en la app y
   mándale al bot `/start <código>`. Comandos (con y sin `/`): `hoy`, `manana`,
   `semana`, `quien`, `compra`, `apunta`, `marca`, `desmarca`, `quita`,
   `despensa`, `guarda`, `gastado`, `caduca`, `cocinada`, `nota`, `veto`,
   `desveto`, `receta`, `ayuda`.
