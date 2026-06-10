# design-system

## ADDED Requirements

### Requirement: Tokens brutalistas únicos
La UI SHALL usar exclusivamente los tokens del sistema: tipografía monospace única, fondo papel (`#F4F1EA`), tinta negra, acento rojo (`#FF3B00`) para la persona A y azul (`#0033FF`) para la persona B, sin border-radius en ningún elemento.

#### Scenario: Sin esquinas redondeadas
- **WHEN** se renderiza cualquier componente de la aplicación
- **THEN** ningún elemento tiene `border-radius` distinto de 0

#### Scenario: Color por persona
- **WHEN** un dato pertenece a un miembro concreto (ración, cocinero, rating, macro)
- **THEN** se muestra con el color de acento de esa persona, sin necesidad de icono o etiqueta adicional

### Requirement: Componentes base con interacción física
Los componentes interactivos SHALL tener borde negro de 2-3px y sombra dura desplazada, y al pulsarse SHALL "hundirse" (translate igual a la sombra, sombra a 0).

#### Scenario: Pulsación de botón
- **WHEN** el usuario mantiene pulsado un botón
- **THEN** el botón se desplaza 4px en X/Y y su sombra desaparece, volviendo al estado normal al soltar

### Requirement: Estados sin decoración
Los estados de sistema SHALL ser tipográficos: errores en bloque negro con texto blanco en mayúsculas, cargas con texto parpadeante `CARGANDO...`, vacíos con mensaje en mayúsculas.

#### Scenario: Error de red
- **WHEN** falla una operación contra el backend
- **THEN** se muestra un bloque negro con el mensaje de error en blanco y mayúsculas, sin iconos ni toasts flotantes

### Requirement: Calendario como rejilla cruda
El calendario semanal SHALL renderizarse como tabla con rejilla negra visible (días × slots), sin cards flotantes, y los números nutricionales SHALL usar cifras tabulares.

#### Scenario: Vista semanal
- **WHEN** el usuario abre el calendario
- **THEN** ve una tabla 7×3 con bordes negros continuos donde cada celda es un slot de comida
