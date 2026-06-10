import type { ReactNode } from 'react'

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={`inline-block border-2 border-ink px-2 py-0.5 text-xs font-bold uppercase ${active ? 'bg-ink text-paper' : 'bg-white'}`}
    >
      {children}
    </span>
  )
}

/** Marca de persona: cuadrado con el color de acento del miembro. */
export function PersonMark({ accent, label }: { accent: 'a' | 'b'; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold uppercase">
      <span className={`inline-block size-3 border-2 border-ink ${accent === 'a' ? 'bg-person-a' : 'bg-person-b'}`} />
      {label}
    </span>
  )
}
