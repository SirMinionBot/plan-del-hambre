# pwa-push

## ADDED Requirements

### Requirement: PWA instalable
La aplicación SHALL ser una PWA instalable (manifest + service worker vía vite-plugin-pwa) con los assets de la identidad brutalista, utilizable a pantalla completa en móvil.

#### Scenario: Instalación en móvil
- **WHEN** un miembro abre la app en su móvil y la añade a la pantalla de inicio
- **THEN** la app se abre standalone sin el chrome del navegador

### Requirement: Suscripción a push por usuario
Cada miembro SHALL poder activar notificaciones push desde su perfil; la suscripción (endpoint + claves) SHALL guardarse asociada a su usuario. Rechazar el permiso SHALL dejar la app plenamente funcional con avisos in-app como fallback.

#### Scenario: Permiso denegado
- **WHEN** un miembro deniega el permiso de notificaciones
- **THEN** la app sigue mostrando los avisos como banners al abrir, sin reintentos de permiso en cada visita

### Requirement: Recordatorio dominical de planificación
El sistema SHALL enviar un push el domingo por la tarde a los miembros suscritos si la semana siguiente tiene slots sin planificar, mediante Edge Function programada.

#### Scenario: Semana sin planificar
- **WHEN** es domingo a las 17:00 y la semana siguiente está incompleta
- **THEN** los suscritos reciben "¿PLANIFICAMOS? TENGO UNA PROPUESTA LISTA"

#### Scenario: Semana ya planificada
- **WHEN** es domingo a las 17:00 y todos los slots de la semana siguiente están ocupados
- **THEN** no se envía ningún push

### Requirement: Push de caducidades
El sistema SHALL enviar un push diario a los suscritos cuando existan ítems de despensa que caduquen en 2 días o menos, agrupando todos los ítems en una sola notificación.

#### Scenario: Varios ítems caducando
- **WHEN** espinacas y yogures caducan en 2 días
- **THEN** llega una única notificación que menciona ambos
