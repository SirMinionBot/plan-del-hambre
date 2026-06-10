# auth-household

## ADDED Requirements

### Requirement: Registro y autenticación individual
Cada miembro de la pareja SHALL tener su propia cuenta (email + contraseña vía Supabase Auth) con perfil propio: nombre visible, objetivo calórico diario y objetivos opcionales de macros (proteína, carbohidratos, grasa).

#### Scenario: Alta de usuario
- **WHEN** un usuario se registra con email y contraseña
- **THEN** se crea automáticamente su perfil con objetivo calórico por defecto (2000 kcal) editable después

### Requirement: Recuperación de contraseña
Un usuario SHALL poder solicitar desde la pantalla de entrada un enlace de recuperación por email; el enlace SHALL llevar a una pantalla donde fijar una nueva contraseña y entrar directamente. Un enlace caducado SHALL mostrar un error claro con la opción de pedir otro.

#### Scenario: Recuperar cuenta existente
- **WHEN** el usuario pulsa "he olvidado la contraseña" con su email escrito
- **THEN** recibe un correo cuyo enlace abre la pantalla de nueva contraseña y, al guardarla, queda autenticado

#### Scenario: Enlace caducado
- **WHEN** el usuario abre un enlace de recuperación caducado
- **THEN** ve "enlace caducado o no válido" y cómo pedir otro, sin pantalla en blanco

### Requirement: Hogar compartido por código de invitación
Un usuario sin hogar SHALL poder crear un hogar (quedando como primer miembro) o unirse a uno existente introduciendo su código de invitación de 6 caracteres. Un usuario SHALL pertenecer como máximo a un hogar.

#### Scenario: Crear hogar e invitar
- **WHEN** un usuario crea el hogar "Casa"
- **THEN** obtiene un código de invitación visible para compartir con su pareja

#### Scenario: Unirse con código
- **WHEN** el segundo usuario introduce un código de invitación válido
- **THEN** queda vinculado al hogar con el color de acento contrario al del primer miembro

#### Scenario: Código inválido
- **WHEN** un usuario introduce un código que no existe
- **THEN** ve un error y no se crea ninguna membresía

### Requirement: Aislamiento de datos por hogar
Los datos del hogar (calendario, recetas propias, despensa, compra, plantillas propias) SHALL ser visibles y editables únicamente por sus miembros, garantizado por políticas RLS en base de datos. Los datos personales (ratings, vetos, exclusiones, objetivos) SHALL ser editables solo por su dueño, aunque legibles por el compañero de hogar.

#### Scenario: Usuario de otro hogar
- **WHEN** un usuario autenticado de otro hogar consulta el calendario de este hogar directamente contra la API
- **THEN** la base de datos no devuelve ninguna fila

#### Scenario: Compañero lee, no escribe
- **WHEN** un miembro consulta los ratings de su pareja
- **THEN** puede leerlos pero cualquier intento de modificarlos es rechazado
