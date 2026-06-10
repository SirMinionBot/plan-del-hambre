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

### Requirement: Router de comandos determinista
El bot SHALL interpretar mensajes mediante una tabla de comandos con coincidencia exacta del primer token (con alias declarados), sin heurísticas sobre el texto libre. Argumentos inválidos SHALL responder con la sintaxis exacta del comando; entrada no reconocida SHALL responder la ayuda. Las búsquedas por texto SHALL actuar solo con coincidencia única; con varias, SHALL listar candidatos ordenados alfabéticamente sin elegir por el usuario. Fechas SOLO en formato YYYY-MM-DD o DD/MM; cantidades con unidades del conjunto fijo (g/kg/ml/l/ud/pieza/cda/cdta) con conversión determinista.

#### Scenario: Argumento inválido
- **WHEN** un miembro escribe "/nota seis lentejas"
- **THEN** el bot responde con el uso exacto de /nota sin ejecutar nada

#### Scenario: Coincidencia múltiple
- **WHEN** "/marca tomate" coincide con "tomate" y "tomate triturado"
- **THEN** el bot lista ambos y pide repetir con el nombre completo, sin marcar ninguno

### Requirement: Cobertura de operaciones por chat
Un chat vinculado SHALL poder: consultar hoy/mañana/semana completa y quién cocina; ver, añadir, marcar, desmarcar y quitar ítems de la compra; ver la despensa, guardar con caducidad, dar de baja y consultar caducidades; marcar una comida de hoy como cocinada por slot; puntuar, vetar y desvetar recetas (conservando el resto del rating); y consultar la ficha de una receta con ingredientes. Todas las operaciones SHALL limitarse al hogar del usuario vinculado.

#### Scenario: Añadir a la compra desde el chat
- **WHEN** un miembro vinculado escribe "/apunta 2 kg arroz"
- **THEN** el ítem aparece en la lista de la semana actual (en tiempo real en los móviles) con 2000 g y vinculado al catálogo

#### Scenario: Marcar cocinada por slot
- **WHEN** un miembro escribe "/cocinada cena" y la cena de hoy tiene receta
- **THEN** la entrada queda marcada como cocinada y cuenta para el histórico
