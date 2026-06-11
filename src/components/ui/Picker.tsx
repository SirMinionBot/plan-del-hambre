import { useEffect, useMemo, useRef, useState } from 'react'

export interface PickerItem {
  id: string
  label: string
  sublabel?: string
}

const MAX_RESULTS = 60

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Selector cómodo para catálogos grandes (recetas, ingredientes): botón que
 * abre un buscador a pantalla completa con filtrado sin tildes y targets
 * táctiles grandes. Sustituye a <select>/<datalist> en móvil.
 */
export function Picker({
  label,
  value,
  placeholder = 'Elegir...',
  searchPlaceholder = 'Buscar...',
  items,
  onSelect,
  onFreeText,
  clearLabel,
}: {
  label?: string
  value: string
  placeholder?: string
  searchPlaceholder?: string
  items: PickerItem[]
  onSelect: (id: string | null) => void
  /** Si se define, permite "usar tal cual" lo escrito (p. ej. despensa). */
  onFreeText?: (text: string) => void
  /** Si se define, muestra una opción para vaciar la selección. */
  clearLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const all = q ? items.filter((i) => normalize(i.label).includes(q)) : items
    return all.slice(0, MAX_RESULTS)
  }, [items, query])

  const hasExactMatch = items.some((i) => normalize(i.label) === normalize(query.trim()))

  function pick(id: string | null) {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div className="block w-full">
      {label && <span className="mb-1 block text-xs font-bold uppercase">{label}</span>}
      <button
        type="button"
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
        className="border-brutal-thin w-full bg-white px-3 py-2 text-left"
      >
        {value || <span className="uppercase opacity-40">{placeholder}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-paper p-3" role="dialog" aria-modal="true">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="border-brutal w-full bg-white px-3 py-3 text-lg focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border-brutal shadow-brutal-sm press-brutal bg-white px-4 font-bold"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <ul className="border-brutal mt-3 flex-1 overflow-y-auto bg-white">
            {clearLabel && !query && (
              <li>
                <button type="button" onClick={() => pick(null)} className="w-full border-b-2 border-ink/20 px-3 py-3 text-left font-bold uppercase opacity-60">
                  {clearLabel}
                </button>
              </li>
            )}
            {onFreeText && query.trim() && !hasExactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onFreeText(query.trim())
                    setOpen(false)
                  }}
                  className="w-full border-b-2 border-ink/20 bg-warn px-3 py-3 text-left font-bold"
                >
                  Usar "{query.trim()}" tal cual
                </button>
              </li>
            )}
            {filtered.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => pick(i.id)} className="w-full border-b-2 border-ink/20 px-3 py-3 text-left hover:bg-warn/30">
                  <span className="font-bold">{i.label}</span>
                  {i.sublabel && <span className="ml-2 text-xs uppercase opacity-60">{i.sublabel}</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center font-bold uppercase opacity-60">Nada con "{query}"</li>
            )}
          </ul>
          {filtered.length === MAX_RESULTS && (
            <p className="mt-1 text-xs font-bold uppercase opacity-60">Mostrando {MAX_RESULTS} — afina la búsqueda</p>
          )}
        </div>
      )}
    </div>
  )
}
