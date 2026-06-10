# recipe-catalog

## ADDED Requirements

### Requirement: Catálogo global seed
La aplicación SHALL incluir un catálogo seed de aproximadamente 250 recetas en español, cada una con ingredientes vinculados, macros derivadas de los ingredientes, etiquetas (`rapida`, `batch`, `fiambrera`, `sin-horno`, ...), temporada, días que rinde (`batch_days`) y coste estimado. Las recetas seed SHALL ser legibles por cualquier usuario autenticado y no editables.

#### Scenario: Macros derivadas
- **WHEN** se consulta una receta del catálogo
- **THEN** sus calorías y macros por ración se calculan a partir de las cantidades de sus ingredientes y el número de raciones

#### Scenario: Editar receta seed
- **WHEN** un usuario edita una receta del catálogo global
- **THEN** se crea una copia como receta del hogar (fork) y la original permanece intacta

### Requirement: Recetas del hogar
Los miembros SHALL poder crear, editar y borrar recetas propias del hogar con los mismos campos que el catálogo.

#### Scenario: Crear receta propia
- **WHEN** un miembro crea una receta con nombre, ingredientes y raciones
- **THEN** la receta es visible para ambos miembros y solo para ellos

### Requirement: Ratings y veto por persona
Cada miembro SHALL poder puntuar cualquier receta de 1 a 5 y marcarla con veto duro. Una receta vetada por cualquiera de los dos SHALL quedar excluida del recomendador y marcada visualmente en el catálogo.

#### Scenario: Veto de un miembro
- **WHEN** un miembro veta una receta
- **THEN** la receta nunca aparece como sugerencia del recomendador aunque el otro la haya puntuado con 5

### Requirement: Calibración inicial de gustos
La aplicación SHALL ofrecer un flujo de calibración rápida: una muestra variada (~24 recetas, diversificada por ingrediente principal, excluyendo las ya valoradas) que se responde con "ni de broma" (veto), "meh" (2), "sí" (4) o "favorita" (5), con opción de saltar. Mientras un miembro tenga menos de 10 valoraciones, la vista de hoy SHALL mostrar un aviso enlazando a la calibración.

#### Scenario: Calibrar en frío
- **WHEN** un miembro nuevo completa la calibración
- **THEN** sus respuestas quedan guardadas como ratings/vetos y el recomendador deja de tratarle como desconocido

#### Scenario: Aviso de recomendador ciego
- **WHEN** un miembro con menos de 10 valoraciones abre la vista de hoy
- **THEN** ve un aviso "el recomendador aún no te conoce" que enlaza a la calibración

### Requirement: Exclusiones de ingredientes por persona
Cada miembro SHALL poder mantener una lista de ingredientes excluidos (alergia o manía). Cualquier receta que contenga un ingrediente excluido por cualquiera de los miembros SHALL quedar fuera de las sugerencias del recomendador.

#### Scenario: Alergia
- **WHEN** un miembro excluye "nueces"
- **THEN** ninguna receta con nueces aparece como sugerencia para ningún slot compartido

### Requirement: Importador Spoonacular opcional
Si existe `VITE_SPOONACULAR_KEY`, la aplicación SHALL permitir buscar recetas en Spoonacular e importarlas como recetas del hogar etiquetadas `importada`. Sin la clave, la funcionalidad SHALL quedar oculta y la aplicación SHALL funcionar con normalidad.

#### Scenario: Sin API key
- **WHEN** la aplicación arranca sin `VITE_SPOONACULAR_KEY`
- **THEN** la UI de importación no se muestra y no se hace ninguna llamada externa
