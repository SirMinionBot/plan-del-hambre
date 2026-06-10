import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/Button'

/**
 * Valoración exprés tras marcar una comida como cocinada: el momento natural
 * de capturar el gusto que alimenta al recomendador.
 */
export function QuickRating({
  recipeId,
  recipeName,
  onClose,
}: {
  recipeId: string
  recipeName: string
  onClose: () => void
}) {
  const { session } = useAuth()
  const uid = session!.user.id

  async function rate(rating: number) {
    // conserva un veto previo si lo hubiera
    const { data: existing } = await supabase
      .from('recipe_ratings')
      .select('vetoed')
      .eq('user_id', uid)
      .eq('recipe_id', recipeId)
      .maybeSingle()
    await supabase
      .from('recipe_ratings')
      .upsert({ user_id: uid, recipe_id: recipeId, rating, vetoed: existing?.vetoed ?? false })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={onClose}>
      <div
        className="border-brutal shadow-brutal-lg flex w-full max-w-sm flex-col gap-4 bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>¿Repetiríamos?</h2>
        <p className="font-bold">{recipeName}</p>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => void rate(n)}
              className="border-brutal-thin shadow-brutal-sm press-brutal bg-white py-3 text-xl font-bold hover:bg-warn"
              data-numeric
            >
              {n}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose}>
          Ahora no
        </Button>
      </div>
    </div>
  )
}
