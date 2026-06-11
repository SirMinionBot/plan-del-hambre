# weekly-digest — digest dominical

## ADDED Requirements

### Requirement: Composición del digest semanal
El sistema SHALL componer un resumen de la semana entrante con: menú por día y
franja, coste previsto si hay precios registrados, qué descongelar para el
primer día y si la lista de la compra de la semana está sin generar.

#### Scenario: Semana planificada con precios
- **WHEN** se compone el digest de un hogar con la semana planificada y precios registrados
- **THEN** el digest incluye el menú por día/franja y el coste previsto de la semana

#### Scenario: Semana sin planificar
- **WHEN** el hogar no tiene entradas para la semana entrante
- **THEN** el digest se reduce a un recordatorio de planificar (comportamiento actual conservado)

#### Scenario: Sin precios registrados
- **WHEN** el hogar no tiene precios de ingredientes
- **THEN** el digest omite la sección de coste sin error

### Requirement: Envío dominical por push y Telegram
El digest SHALL enviarse automáticamente los domingos por la tarde mediante la
Edge Function existente (cron actual), por notificación push a los suscritos y
por Telegram a los usuarios vinculados del hogar.

#### Scenario: Envío programado
- **WHEN** el cron dominical invoca la función con el tipo de digest semanal
- **THEN** cada hogar con miembros suscritos recibe el push del digest
- **AND** cada usuario con Telegram vinculado recibe el mismo contenido por el bot

#### Scenario: Protección del endpoint
- **WHEN** la función recibe una petición sin el secret del cron
- **THEN** responde con error y no envía nada

### Requirement: Digest bajo demanda en Telegram
El bot de Telegram SHALL responder al comando `/semana` con el digest de la
semana entrante del hogar del usuario vinculado.

#### Scenario: Comando /semana
- **WHEN** un usuario vinculado envía `/semana` al bot
- **THEN** el bot responde con el digest actual de su hogar

#### Scenario: Usuario sin vincular
- **WHEN** un usuario no vinculado envía `/semana`
- **THEN** el bot responde indicando cómo vincular su cuenta (flujo existente)
