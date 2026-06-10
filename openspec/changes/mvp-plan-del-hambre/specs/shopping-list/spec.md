# shopping-list

## ADDED Requirements

### Requirement: Generación desde el plan semanal
La lista de la compra SHALL generarse a partir de las entradas de la semana, sumando cantidades de ingredientes repetidos (escaladas a las raciones reales de cada entrada) y agrupándolas por categoría de ingrediente (pasillo del súper). Las entradas de tipo `sobras` SHALL NOT añadir ingredientes.

#### Scenario: Ingrediente repetido
- **WHEN** dos recetas de la semana llevan 200 g y 150 g de arroz
- **THEN** la lista muestra una sola línea "arroz — 350 g" bajo su categoría

#### Scenario: Sobras no duplican
- **WHEN** una receta batch ocupa lunes (normal) y martes (sobras)
- **THEN** sus ingredientes se añaden una sola vez

### Requirement: Sincronización en tiempo real
Los checkboxes de la lista SHALL sincronizarse entre los dispositivos de ambos miembros en tiempo real (Supabase Realtime), registrando quién marcó cada ítem.

#### Scenario: Compra simultánea
- **WHEN** A marca "tomates" en su móvil estando B con la lista abierta
- **THEN** B ve el ítem marcado sin recargar, con el color de acento de A

### Requirement: Descuento de despensa
Los ítems cuyo ingrediente esté presente en la despensa SHALL marcarse como "ya lo tenéis" (visualmente diferenciados, no eliminados).

#### Scenario: Ya en despensa
- **WHEN** se genera la lista y la despensa contiene "arroz"
- **THEN** la línea de arroz aparece marcada como disponible en despensa pero sigue visible por si se quiere reponer

### Requirement: Coste estimado semanal
La lista SHALL mostrar el coste estimado total de la semana a partir de los precios aproximados de los ingredientes, visible antes de comprar.

#### Scenario: Presupuesto visible
- **WHEN** el usuario abre la lista de una semana planificada
- **THEN** ve el total estimado en euros y el subtotal por categoría
