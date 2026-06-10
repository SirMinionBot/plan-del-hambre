# telegram-bot

## ADDED Requirements

### Requirement: Vinculación segura de chat
El bot SHALL vincular un chat de Telegram a un usuario mediante `/start <código>`, donde el código es el `telegram_link_code` visible en el perfil de la app. Un chat sin vincular SHALL recibir instrucciones de vinculación ante cualquier otro mensaje, y el webhook SHALL rechazar peticiones sin el secret token correcto.

#### Scenario: Vincular cuenta
- **WHEN** un usuario envía `/start <su código>` al bot
- **THEN** el chat queda vinculado a su usuario y el bot le saluda por su nombre

#### Scenario: Webhook falsificado
- **WHEN** llega una petición sin el header de secret token válido
- **THEN** se responde 401 y no se procesa nada

### Requirement: Consultas y operaciones por chat
Un chat vinculado SHALL poder: consultar las comidas de hoy y de mañana (con cocinero), ver la lista de la compra pendiente agrupada por pasillo, añadir ítems ("añade 2 kg arroz", vinculando al catálogo si el nombre coincide), marcar comprados, y apuntar cosas a la despensa con caducidad opcional. Todas las operaciones SHALL limitarse al hogar del usuario vinculado.

#### Scenario: Añadir a la compra desde el chat
- **WHEN** un miembro vinculado escribe "añade 500 g harina"
- **THEN** el ítem aparece en la lista de la semana actual (y en tiempo real en los móviles) con cantidad y unidad parseadas

#### Scenario: Qué hay hoy
- **WHEN** un miembro escribe "hoy"
- **THEN** recibe las tres comidas del día con receta o tipo y quién cocina
