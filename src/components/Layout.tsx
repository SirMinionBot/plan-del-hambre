import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../hooks/useHousehold'
import { Banner } from './ui/Banner'
import type { PantryItem } from '../types/db'

const NAV = [
  { to: '/', label: 'Hoy' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/recetas', label: 'Recetas' },
  { to: '/compra', label: 'Compra' },
  { to: '/despensa', label: 'Despensa' },
  { to: '/plantillas', label: 'Plantillas' },
  { to: '/stats', label: 'Stats' },
  { to: '/perfil', label: 'Perfil' },
]

function formatDay(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase()
}

/** Avisos brutalistas: caducidades inminentes (fallback in-app del push). */
function ExpiryBanner() {
  const { household } = useHousehold()
  const [expiring, setExpiring] = useState<PantryItem[]>([])

  useEffect(() => {
    if (!household) return
    const limit = new Date()
    limit.setDate(limit.getDate() + 2)
    supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', household.id)
      .not('expires_on', 'is', null)
      .lte('expires_on', limit.toISOString().slice(0, 10))
      .then(({ data }) => setExpiring(data ?? []))
  }, [household])

  if (expiring.length === 0) return null
  return (
    <Banner variant="warn">
      {expiring.map((i) => `${i.name} muere el ${formatDay(i.expires_on!)}`).join(' · ')}
    </Banner>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="border-brutal flex flex-col bg-white">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `border-b-2 border-ink px-4 py-3 font-bold uppercase last:border-b-0 ${
              isActive ? 'bg-ink text-paper' : 'bg-white hover:bg-warn'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // cierra el cajón al navegar (por si acaso) y bloquea el scroll de fondo
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-3 pb-12">
      <header className="flex items-center justify-between gap-2 border-b-4 border-ink py-4">
        <h1 className="text-2xl sm:text-4xl">Plan del hambre</h1>
        <button
          onClick={() => setOpen(true)}
          className="border-brutal-thin shadow-brutal-sm press-brutal bg-warn px-3 py-2 font-bold uppercase lg:hidden"
          aria-label="Abrir menú"
        >
          ☰ Menú
        </button>
      </header>

      <div className="mt-4 lg:grid lg:grid-cols-[13rem_1fr] lg:items-start lg:gap-6">
        {/* lateral persistente en pantalla grande */}
        <aside className="sticky top-4 hidden lg:block">
          <NavList />
        </aside>

        {/* cajón lateral en móvil */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col gap-3 border-r-4 border-ink bg-paper p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase">Menú</span>
                <button
                  onClick={() => setOpen(false)}
                  className="border-brutal-thin shadow-brutal-sm press-brutal bg-white px-3 py-1 font-bold"
                  aria-label="Cerrar menú"
                >
                  ✕
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-col gap-4">
          <ExpiryBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
