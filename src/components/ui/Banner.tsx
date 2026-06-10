import type { ReactNode } from 'react'

type BannerVariant = 'error' | 'warn' | 'ok'

const variantClasses: Record<BannerVariant, string> = {
  error: 'bg-ink text-paper',
  warn: 'bg-warn text-ink border-brutal-thin',
  ok: 'bg-ok text-white',
}

export function Banner({ variant = 'warn', children }: { variant?: BannerVariant; children: ReactNode }) {
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`px-4 py-3 font-bold uppercase ${variantClasses[variant]}`}>
      {children}
    </div>
  )
}

export function Loading({ label = 'CARGANDO...' }: { label?: string }) {
  return <p className="blink-brutal py-8 text-center font-bold uppercase">{label}</p>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-brutal flex min-h-32 items-center justify-center border-dashed p-8 text-center font-bold uppercase opacity-60">
      {children}
    </div>
  )
}
