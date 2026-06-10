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

### Requirement: Superficies planas redondeadas
Las superficies SHALL ser cards planas con esquinas redondeadas (≥ 0.75rem; 1.25rem en cards principales), separadas por contraste de color sólido y bordes finos — sin sombras apreciables ni degradados. Los elementos interactivos SHALL responder al pulsarse con una reducción sutil de escala.

#### Scenario: Pulsación de botón
- **WHEN** el usuario mantiene pulsado un botón
- **THEN** el botón se encoge ligeramente (scale ~0.97), volviendo al soltar

### Requirement: Navegación intuitiva por pestañas
En móvil la navegación SHALL ser una barra inferior fija con las cuatro secciones de uso diario (Hoy, Semana, Recetas, Compra) con icono + etiqueta y estado activo en violeta, más una pestaña "Más" que abre el resto de secciones. En pantalla grande SHALL ser una barra lateral persistente.

#### Scenario: Cambiar de sección con el pulgar
- **WHEN** el usuario toca "Compra" en la barra inferior
- **THEN** navega a la lista de la compra sin pasos intermedios y la pestaña queda marcada en violeta

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
