import type { ReactNode } from 'react'

type BannerVariant = 'error' | 'warn' | 'ok'

const variantClasses: Record<BannerVariant, string> = {
  error: 'bg-person-a/12 text-person-a',
  warn: 'bg-warn/15 text-[#9a6a14]',
  ok: 'bg-ok/12 text-[#0f8d6e]',
}

export function Banner({ variant = 'warn', children }: { variant?: BannerVariant; children: ReactNode }) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl px-4 py-3 font-bold ${variantClasses[variant]}`}
    >
      {children}
    </div>
  )
}

export function Loading({ label = 'Cargando...' }: { label?: string }) {
  return <p className="blink-brutal py-8 text-center font-bold text-person-b">{label}</p>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-3xl border border-dashed border-ink/20 bg-white/60 p-8 text-center font-bold text-ink/50">
      {children}
    </div>
  )
}
