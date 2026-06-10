# design-system

> Nota de evolución: el MVP nació brutalista; en la iteración 4 el usuario pidió
> migrar a un soft UI claro inspirado en "Custom Workout App" (Fireart Studio,
> Dribbble 7153574). Los nombres de tokens y utilidades se conservaron para que
> el reestilado fuera un cambio de `index.css`, no de pantallas.

## ADDED Requirements

### Requirement: Tokens del soft UI
La UI SHALL usar exclusivamente los tokens del sistema: tipografía Manrope, fondo lavanda claro (`#F6F5FB`), texto azul noche (`#221C44`), violeta (`#7C5CFC`) como primario y acento de la persona B, y coral (`#FF7A59`) como acento de la persona A y color de peligro.

#### Scenario: Color por persona
- **WHEN** un dato pertenece a un miembro concreto (ración, cocinero, rating, macro)
- **THEN** se muestra con el color de acento de esa persona (coral o violeta), sin necesidad de icono o etiqueta adicional

### Requirement: Cards redondeadas con sombra difusa
Las superficies SHALL ser cards con esquinas muy redondeadas (≥ 0.875rem; 1.5rem en cards principales) y sombras difusas con tinte violeta en lugar de bordes duros. Los elementos interactivos SHALL responder al pulsarse con una reducción sutil de escala.

#### Scenario: Pulsación de botón
- **WHEN** el usuario mantiene pulsado un botón
- **THEN** el botón se encoge ligeramente (scale ~0.97) y pierde la sombra, volviendo al soltar

### Requirement: Reestilado centralizado
El sistema SHALL poder reestilarse por completo editando los tokens y utilidades de `src/index.css` (los nombres `paper/ink/person-a/person-b`, `border-brutal*`, `shadow-brutal*`, `press-brutal`, `blink-brutal` son estables) sin modificar las pantallas.

#### Scenario: Cambio de paleta
- **WHEN** se cambia el valor de un token de color o sombra en `index.css`
- **THEN** todas las pantallas reflejan el cambio sin ediciones adicionales

### Requirement: Estados con color semántico
Los estados de sistema SHALL usar superficies suaves tintadas: errores en coral, avisos en ámbar, confirmaciones en verde menta, carga con pulso de opacidad y vacíos sobre card punteada — siempre con esquinas redondeadas.

#### Scenario: Error de red
- **WHEN** falla una operación contra el backend
- **THEN** se muestra una card redondeada con tinte coral y el mensaje, sin bloques negros ni toasts flotantes
