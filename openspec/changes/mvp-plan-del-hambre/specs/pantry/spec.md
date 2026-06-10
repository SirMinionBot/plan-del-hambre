# pantry

## ADDED Requirements

### Requirement: Despensa de presencia y caducidad
La despensa SHALL registrar ítems del hogar con nombre, vínculo opcional a un ingrediente del catálogo y fecha de caducidad opcional, sin cantidades. Cualquier miembro SHALL poder añadir y retirar ítems.

#### Scenario: Alta rápida
- **WHEN** un miembro añade "espinacas" con caducidad el jueves
- **THEN** el ítem queda visible para ambos con su fecha

### Requirement: Aviso de caducidad próxima
La aplicación SHALL destacar los ítems que caducan en 2 días o menos con un banner brutalista al abrir la app (p. ej. "LAS ESPINACAS MUEREN EL JUEVES").

#### Scenario: Caducidad inminente
- **WHEN** un ítem caduca en menos de 48 horas
- **THEN** aparece un banner en mayúsculas al abrir la aplicación

### Requirement: Prioridad en el recomendador
Las recetas que consuman ingredientes de despensa próximos a caducar SHALL recibir un bonus de puntuación en el recomendador, visible en el desglose.

#### Scenario: Rescate de espinacas
- **WHEN** hay espinacas caducando el jueves y se planifica la semana
- **THEN** las recetas con espinacas puntúan más alto en los slots anteriores al jueves, con el bonus explicado en el desglose
