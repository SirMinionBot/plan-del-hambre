# household-stats

## ADDED Requirements

### Requirement: Evolución de macros por persona
La aplicación SHALL mostrar, por miembro, la evolución semanal de calorías y macros consumidas frente a sus objetivos, calculada desde las entradas del calendario y sus raciones individuales. Los días `fuera`, `cheat` y `evento` SHALL distinguirse en la visualización.

#### Scenario: Semana vs objetivo
- **WHEN** un miembro abre sus estadísticas
- **THEN** ve sus calorías diarias de las últimas semanas contra su objetivo, en su color de acento

### Requirement: Rachas y top de recetas
La aplicación SHALL mostrar del hogar: semanas consecutivas con planificación completa, recetas más cocinadas (según marcado de cocinada) y número de comodines (`fuera`/`cheat`) del mes.

#### Scenario: Racha activa
- **WHEN** el hogar lleva 5 semanas seguidas con la semana planificada
- **THEN** las estadísticas muestran la racha "5 SEMANAS" y se reinicia si una semana queda sin planificar

#### Scenario: Top recetas
- **WHEN** el hogar consulta el top
- **THEN** ve las recetas ordenadas por veces cocinadas con su recuento
