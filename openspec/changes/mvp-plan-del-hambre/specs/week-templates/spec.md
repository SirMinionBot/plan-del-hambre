# week-templates

## ADDED Requirements

### Requirement: Plantillas de serie
La aplicación SHALL incluir 4 plantillas seed visibles para todos los hogares: "Gimnasio" (cenas altas en proteína), "Fiambreras" (comidas transportables), "Semana rápida" (todo ≤30 min o batch) y "Libre" (sin restricciones). Las plantillas de serie SHALL NOT ser editables.

#### Scenario: Catálogo de plantillas
- **WHEN** el hogar abre el selector de plantillas
- **THEN** ve las 4 de serie más las propias del hogar

### Requirement: Restricciones por slot
Cada plantilla SHALL definir, por día y slot, etiquetas requeridas, etiquetas excluidas y tiempo total máximo opcional. Al planificar con plantilla activa, el recomendador SHALL aplicar estas restricciones como filtro de candidatas por slot.

#### Scenario: Semana rápida entre semana
- **WHEN** se planifica con la plantilla "Semana rápida"
- **THEN** ningún slot de lunes a viernes recibe recetas de más de 30 minutos totales salvo que tengan etiqueta `batch`

### Requirement: Plantillas propias y duplicado de semanas
El hogar SHALL poder crear plantillas propias desde cero y guardar una semana pasada como plantilla ("esta semana funcionó"). También SHALL poder duplicar una semana pasada directamente sobre una semana futura.

#### Scenario: Guardar semana como plantilla
- **WHEN** un miembro guarda la semana del 1 de junio como plantilla "Semana tipo"
- **THEN** la plantilla recoge las restricciones derivadas (etiquetas de las recetas usadas) y aparece en el selector del hogar

#### Scenario: Duplicar semana
- **WHEN** un miembro duplica la semana pasada sobre la próxima
- **THEN** los slots se copian con recetas, raciones y cocineros, editables después
