# price-tracking — precios reales por supermercado

## ADDED Requirements

### Requirement: Captura de precios desde el ticket
El sistema SHALL extraer el precio de cada línea del ticket emparejada con un
ingrediente del catálogo y guardarlo como observación de precio asociada al
supermercado del ticket, al hogar y a la fecha.

#### Scenario: Escaneo con súper detectado
- **WHEN** el usuario escanea un ticket cuya cabecera contiene "MERCADONA"
- **THEN** el sistema preselecciona Mercadona como supermercado del ticket
- **AND** muestra las líneas emparejadas con su precio para confirmación

#### Scenario: Confirmación editable antes de guardar
- **WHEN** el usuario confirma la pantalla de revisión del ticket
- **THEN** se crea una observación de precio por cada línea emparejada no descartada
- **AND** las líneas sin match con el catálogo no generan observación

#### Scenario: Súper no detectado
- **WHEN** el OCR no identifica la cadena del ticket
- **THEN** el sistema pide al usuario elegir el supermercado entre Día, Lidl y
  Mercadona antes de guardar precios

### Requirement: Histórico por ingrediente y supermercado
El sistema SHALL conservar todas las observaciones de precio por (ingrediente,
supermercado, hogar) y SHALL considerar precio vigente la observación más
reciente de cada par.

#### Scenario: Precio vigente tras varias compras
- **WHEN** existen observaciones del aceite de oliva en Lidl del 1 y del 15 del mes
- **THEN** el precio vigente del aceite en Lidl es el del día 15

#### Scenario: Aislamiento por hogar
- **WHEN** un usuario consulta precios
- **THEN** solo ve observaciones de su propio hogar (RLS por membresía)

### Requirement: Coste derivado por receta
El sistema SHALL calcular el coste de una receta derivándolo de sus
ingredientes y los precios vigentes, sin almacenar el resultado, e indicará la
cobertura cuando falten precios.

#### Scenario: Receta con precios completos
- **WHEN** todos los ingredientes de una receta tienen precio vigente en el súper elegido
- **THEN** se muestra el coste total y por ración de la receta

#### Scenario: Cobertura parcial
- **WHEN** solo 8 de 11 ingredientes tienen precio conocido
- **THEN** el coste se muestra acompañado del indicador de cobertura «8/11 ingredientes»

### Requirement: Coste previsto de la semana y comparativa
El sistema SHALL mostrar al planificar el coste previsto de la semana según los
precios vigentes y SHALL permitir comparar el total entre los supermercados con
datos.

#### Scenario: Coste previsto al planificar
- **WHEN** el usuario tiene la semana planificada y precios registrados
- **THEN** el planner muestra el coste previsto de la semana junto al presupuesto (`weekly_budget`)

#### Scenario: Comparativa entre cadenas
- **WHEN** existen precios de un mismo ingrediente en más de un supermercado
- **THEN** el usuario puede ver en qué cadena saldría más barata la semana o la receta
