# weekly-planner

## ADDED Requirements

### Requirement: Filtrado duro previo al scoring
El recomendador SHALL excluir de las candidatas, antes de puntuar, toda receta vetada por cualquiera de los miembros o que contenga un ingrediente excluido por cualquiera de ellos.

#### Scenario: Veto absoluto
- **WHEN** el recomendador genera candidatas y una receta está vetada por un miembro
- **THEN** la receta no aparece en ninguna posición del ranking, sea cual sea su puntuación potencial

### Requirement: Scoring heurístico explicable
El recomendador SHALL puntuar cada candidata como suma ponderada de: gusto mínimo entre ambos miembros, variedad (penalización por receta o ingrediente principal repetido en los últimos 10 días), temporada actual, ajuste a los objetivos de macros restantes de cada uno, solapamiento de ingredientes con la compra de la semana, contexto del slot (etiqueta `rapida` entre semana, elaboradas el fin de semana) y bonus por consumir ítems de despensa próximos a caducar. Cada sugerencia SHALL exponer el desglose de su puntuación en la UI.

#### Scenario: Desglose visible
- **WHEN** el recomendador sugiere una receta para un slot
- **THEN** el usuario puede ver cada componente de la puntuación con su signo y valor (p. ej. "repite el pollo del lunes: −20")

#### Scenario: El menos entusiasta manda
- **WHEN** una receta tiene rating 5 de A y 2 de B, y otra tiene 4 y 4
- **THEN** el componente de gusto puntúa más alto la segunda (mínimo 4 > mínimo 2)

### Requirement: Planificación de semana completa
El recomendador SHALL poder rellenar todos los slots vacíos de la semana de una vez, respetando las entradas ancladas ("peticiones de la semana") y las restricciones de la plantilla activa si la hay.

#### Scenario: Peticiones ancladas
- **WHEN** cada miembro ancla una receta antes de planificar y se lanza la planificación
- **THEN** las recetas ancladas permanecen en sus slots y el resto se rellena alrededor

### Requirement: Alternativa con un toque
Cada slot sugerido SHALL ofrecer un botón "otra" que sustituye la sugerencia por la siguiente mejor puntuada, sin afectar al resto de la semana.

#### Scenario: Rechazar sugerencia
- **WHEN** el usuario pulsa "otra" en el slot del jueves
- **THEN** aparece la siguiente candidata del ranking de ese slot y las demás celdas no cambian

### Requirement: Batch cooking y sobras automáticas
Cuando se planifica una receta con `batch_days` > 1, el recomendador SHALL colocar entradas de tipo `sobras` en los slots equivalentes de los días siguientes, vinculadas a la misma receta.

#### Scenario: Receta que rinde dos días
- **WHEN** se planifica el lunes una receta con `batch_days = 2` para la comida
- **THEN** la comida del martes queda ocupada con una entrada `sobras` de la misma receta
