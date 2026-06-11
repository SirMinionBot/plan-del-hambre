# leftovers — gestión de sobras

## ADDED Requirements

### Requirement: Registro de sobras al marcar cocinado
El sistema SHALL permitir registrar cuántas raciones sobraron al marcar una
comida como cocinada, sin pasos obligatorios adicionales, y SHALL permitir
marcar la sobra como congelada.

#### Scenario: Sobró comida
- **WHEN** el usuario marca una comida como cocinada e indica 2 raciones sobrantes
- **THEN** la entrada guarda 2 raciones de sobra disponibles

#### Scenario: No sobró nada
- **WHEN** el usuario marca cocinado sin tocar el control de sobras
- **THEN** no se registra sobra alguna y el flujo es idéntico al actual

#### Scenario: Congelar la sobra
- **WHEN** el usuario marca la sobra como congelada
- **THEN** la sobra amplía su ventana de consumo más allá de los 3 días de nevera

### Requirement: Disponibilidad y caducidad de sobras
El sistema SHALL calcular las sobras disponibles como las registradas menos las
ya consumidas, dentro de una ventana de frescura de 3 días desde `cooked_at`
para nevera (sin límite definido en esta iteración para congeladas).

#### Scenario: Sobra vigente
- **WHEN** ayer sobraron 2 raciones de lentejas sin congelar
- **THEN** hoy aparecen 2 raciones de lentejas como disponibles

#### Scenario: Sobra caducada
- **WHEN** una sobra de nevera tiene más de 3 días
- **THEN** deja de ofrecerse como disponible

### Requirement: Reaprovechamiento en planner y Hoy
Las sobras disponibles SHALL ofrecerse como sugerencia prioritaria en la página
Hoy y al editar una celda del planner; planificarlas SHALL crear una entrada de
tipo sobras enlazada al origen y descontar las raciones.

#### Scenario: Sugerencia en Hoy
- **WHEN** hay sobras disponibles
- **THEN** la página Hoy muestra un aviso del tipo «tienes fiambrera de lentejas (2 raciones)»

#### Scenario: Planificar una sobra
- **WHEN** el usuario asigna una sobra a la comida de mañana desde el planner
- **THEN** se crea una entrada de tipo `sobras` enlazada a la comida de origen
- **AND** las raciones disponibles de esa sobra se descuentan

#### Scenario: Aviso de congelar
- **WHEN** una sobra de nevera cumple su ventana sin estar planificada y la
  receta tiene ingrediente principal congelable (`typically_frozen`)
- **THEN** la app sugiere congelarla antes de que caduque
