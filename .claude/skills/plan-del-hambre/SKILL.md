---
name: plan-del-hambre
description: Operar la app plan-del-hambre como el usuario del .env — añadir o puntuar recetas del hogar y consultar/modificar la lista de la compra. Usar cuando el usuario pida "añade una receta", "apunta X a la compra", "marca X como comprado", "puntúa/veta una receta" o similar sobre su app de comidas.
---

# plan-del-hambre — operar la app desde aquí

Todo pasa por `scripts/pdh.mjs`, que hace login real contra Supabase con las
credenciales del `.env` (`PDH_EMAIL` / `PDH_PASSWORD`) y llama a la API REST
con el JWT del usuario: **la RLS aplica exactamente igual que en la app**, así
que solo se ve/toca lo del hogar del usuario.

```bash
cd /home/remoteLab/proyectos/plan-del-hambre
source ~/.nvm/nvm.sh 2>/dev/null; node scripts/pdh.mjs <comando>
```

Si falla con "faltan PDH_EMAIL / PDH_PASSWORD", pide al usuario que añada esas
dos líneas a su `.env` (NUNCA las escribas tú ni las muestres en la salida).

## Comandos

| Comando | Qué hace |
|---|---|
| `whoami` | usuario, hogar y household_id (úsalo para verificar conexión) |
| `recipes:add --file r.json` | crea receta del hogar (JSON también por stdin) |
| `recipes:rate <nombre> <1-5>` | puntúa una receta (busca por nombre, exige match único) |
| `recipes:rate <nombre> --veto` | veto duro ("esto no entra en casa") |
| `shopping:show [--week YYYY-MM-DD]` | lista de la compra (semana actual por defecto; la semana empieza en lunes) |
| `shopping:add <nombre> [cant] [unidad]` | añade ítem; si el nombre existe en el catálogo lo vincula (categoría/pasillo), si no va como texto libre |
| `shopping:check <texto>` | marca comprado (substring, case-insensitive; `--all` si hay varios) |
| `shopping:uncheck <texto>` | desmarca |
| `shopping:remove <texto>` | elimina de la lista |

## Crear recetas: reglas

JSON con el mismo formato que los seeds (ver `help` del CLI). Claves:

- `ingredientes[].n` debe ser un nombre **exacto** del catálogo (tabla
  `ingredients`, en minúsculas: "pechuga de pollo", "tomate triturado"...).
  El CLI falla listando los que no existan — en ese caso busca el nombre
  correcto en `supabase/migrations/002_seed_ingredients.sql` o pregunta.
- Cantidades TOTALES para todas las `raciones` (no por ración). Unidades:
  `g`, `ml`, `pieza`, `cda`, `cdta`. Si omites `u`, usa la del catálogo.
- `tags` del vocabulario: desayuno, rapida, sin-horno, horno, veggie,
  ensalada, guiso, fiambrera, batch, dulce. `temporada`: todo-el-ano,
  primavera, verano, otono, invierno. `principal`: una palabra (pollo, pasta,
  legumbre...) — lo usa el recomendador para variedad.
- Sanidad calórica: apunta a 300-800 kcal/ración para platos principales.
- Las macros NO se escriben: se derivan solas de los ingredientes.

Ejemplo completo:

```bash
node scripts/pdh.mjs recipes:add <<'EOF'
{"nombre": "Wok de pollo y verduras", "descripcion": "Salteado rápido entre semana.",
 "instrucciones": "Corta el pollo y las verduras\nSaltea el pollo 5 min\nAñade verduras y salsa de soja\nSirve",
 "raciones": 2, "prep_min": 10, "cocina_min": 12, "tags": ["rapida", "sin-horno"],
 "principal": "pollo",
 "ingredientes": [{"n": "pechuga de pollo", "q": 300, "u": "g"},
   {"n": "pimiento rojo", "q": 1, "u": "pieza"}, {"n": "calabacín", "q": 1, "u": "pieza"},
   {"n": "salsa de soja", "q": 2, "u": "cda"}, {"n": "aceite de oliva", "q": 1, "u": "cda"}]}
EOF
```

## Notas de comportamiento

- La lista de la compra se regenera desde la app ("Generar del plan") y eso
  BORRA e reinserta ítems (conserva checks por ingrediente): los añadidos a
  mano con `shopping:add` desaparecen al regenerar. Avisa al usuario si añade
  ítems sueltos a una semana que probablemente regenere.
- Los cambios en la lista aparecen EN TIEMPO REAL en los móviles del hogar
  (Supabase Realtime) — no hace falta que recarguen.
- El token de sesión se cachea en `/tmp/pdh-session.json` (~1h). Si caduca, el
  CLI reloguea solo.
- No edites recetas del catálogo global (household_id null): son de solo
  lectura; crea una copia del hogar.
