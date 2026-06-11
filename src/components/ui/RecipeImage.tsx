import { useState } from 'react'
import type { Recipe } from '../../types/db'

// Tonos editoriales para el fallback, deterministas por ingrediente principal:
// nada de huecos rotos cuando una receta no tiene foto.
const TONES = [
  'bg-person-b/15 text-person-b',
  'bg-person-a/15 text-person-a',
  'bg-warn/40 text-ink/70',
  'bg-ink/10 text-ink/60',
]

/**
 * Imagen de receta con proporción fija y carga diferida. Sin image_url (o si
 * la URL falla) pinta un placeholder editorial: bloque de color del sistema
 * con la inicial del principal en Fraunces.
 */
export function RecipeImage({ recipe, className = '' }: { recipe: Recipe; className?: string }) {
  const [broken, setBroken] = useState(false)

  if (recipe.image_url && !broken) {
    return (
      <img
        src={recipe.image_url}
        alt={recipe.name}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`aspect-[4/3] w-full bg-ink/5 object-cover ${className}`}
      />
    )
  }

  const label = recipe.main_ingredient ?? recipe.name
  const tone = TONES[[...label].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]
  return (
    <div
      aria-hidden
      className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 ${tone} ${className}`}
    >
      <span className="font-display text-4xl">{label.charAt(0).toUpperCase()}</span>
      <span className="text-[10px] uppercase tracking-widest opacity-70">{label}</span>
    </div>
  )
}
