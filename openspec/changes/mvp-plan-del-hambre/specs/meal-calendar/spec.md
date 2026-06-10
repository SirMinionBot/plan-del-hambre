# meal-calendar

## ADDED Requirements

### Requirement: Calendario semanal del hogar
El hogar SHALL tener un único calendario con tres slots por día (desayuno, comida, cena) y como máximo una entrada por slot. Cada entrada SHALL tener tipo: `normal`, `fuera`, `cheat`, `evento` o `sobras`.

#### Scenario: Slot ocupado
- **WHEN** se intenta crear una segunda entrada para el mismo hogar, fecha y slot
- **THEN** la operación es rechazada por la restricción de unicidad

### Requirement: Raciones asimétricas
Cada entrada SHALL registrar las raciones por miembro (por defecto 1 para cada uno, editable con decimales). Las macros consumidas SHALL calcularse por persona según sus raciones.

#### Scenario: Raciones distintas
- **WHEN** una cena se planifica con 1.5 raciones para A y 1 para B
- **THEN** el resumen diario de A computa 1.5 × macros por ración y el de B 1 × macros por ración

### Requirement: Comidas divergentes
Una entrada SHALL poder asignar una receta distinta a cada miembro (override por persona), manteniendo un único slot en el calendario.

#### Scenario: Uno come fuera
- **WHEN** en la comida del martes A tiene receta y B está marcado "fuera"
- **THEN** la celda muestra ambas situaciones con el color de cada persona y solo computa macros a quien come en casa

### Requirement: Cocinero asignado
Cada entrada de tipo `normal` o `sobras` SHALL poder asignar qué miembro cocina, y el calendario SHALL mostrar el balance semanal de cocinados por persona.

#### Scenario: Balance semanal
- **WHEN** la semana tiene 4 comidas cocinadas por A y 2 por B
- **THEN** la cabecera del calendario muestra el balance 4-2 con los colores de cada persona

### Requirement: Marcado de cocinada
Una entrada SHALL poder marcarse como cocinada (`cooked_at`), alimentando el histórico de rachas y top de recetas.

#### Scenario: Marcar cocinada
- **WHEN** un miembro marca la cena de hoy como cocinada
- **THEN** la entrada queda fechada y cuenta para las estadísticas del hogar
