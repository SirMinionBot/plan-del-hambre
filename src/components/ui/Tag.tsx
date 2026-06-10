import type { ReactNode } from 'react'

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
        active ? 'bg-person-b text-white' : 'bg-person-b/10 text-person-b'
      }`}
    >
      {children}
    </span>
  )
}

/** Marca de persona: punto con el color de acento del miembro. */
export function PersonMark({ accent, label }: { accent: 'a' | 'b'; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
      <span className={`inline-block size-3 rounded-full ${accent === 'a' ? 'bg-person-a' : 'bg-person-b'}`} />
      {label}
    </span>
  )
}
