# recipe-images — fotos del catálogo

## ADDED Requirements

### Requirement: Poblado batch de imágenes del catálogo
El sistema SHALL proveer un comando de CLI que rellene `image_url` de las
recetas del catálogo global a partir de matching con una fuente externa, de
forma idempotente y revisable.

#### Scenario: Dry-run revisable
- **WHEN** se ejecuta el comando con `--dry-run`
- **THEN** se listan los matches propuestos (receta → URL de imagen) sin escribir en BD

#### Scenario: Ejecución idempotente
- **WHEN** se ejecuta el comando sin flags sobre un catálogo parcialmente poblado
- **THEN** solo se rellenan las recetas con `image_url` null
- **AND** las ya pobladas no se tocan salvo `--force`

#### Scenario: Match insuficiente
- **WHEN** la fuente externa no devuelve un match con score suficiente para una receta
- **THEN** su `image_url` queda null (la UI usará el fallback editorial)

### Requirement: Presentación de imágenes en la app
Las pantallas de catálogo (Recipes), detalle (RecipeDetail) y portada (Hoy)
SHALL mostrar la imagen de la receta cuando exista, con carga diferida, y un
placeholder editorial coherente con el sistema de diseño cuando no.

#### Scenario: Receta con imagen
- **WHEN** una receta tiene `image_url`
- **THEN** su card y su detalle muestran la imagen con `loading="lazy"` y proporción fija

#### Scenario: Receta sin imagen
- **WHEN** una receta no tiene `image_url`
- **THEN** se muestra un placeholder editorial derivado de `main_ingredient`
  (color del sistema + tipografía de display), nunca un hueco roto

#### Scenario: Imágenes offline
- **WHEN** el usuario vuelve a abrir la app sin conexión
- **THEN** las imágenes ya vistas se sirven de la caché del service worker
