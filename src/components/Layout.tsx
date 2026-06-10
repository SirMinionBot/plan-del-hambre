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

// pestañas inferiores (móvil): lo de uso diario a un pulgar de distancia
const TABS = [
  { to: '/', label: 'Hoy', icon: '🍽️' },
  { to: '/calendario', label: 'Semana', icon: '📅' },
  { to: '/recetas', label: 'Recetas', icon: '📖' },
  { to: '/compra', label: 'Compra', icon: '🛒' },
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
            `m-1 rounded-xl px-4 py-2.5 font-bold ${
              isActive ? 'bg-person-b text-white shadow-brutal-sm' : 'text-ink/70 hover:bg-person-b/10'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Indicador de sin conexión: la lectura sirve datos cacheados; la escritura fallará. */
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  if (online) return null
  return <Banner variant="error">Sin conexión — viendo los últimos datos guardados. Los cambios no se guardarán.</Banner>
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
      <header className="flex items-center justify-between gap-2 py-5">
        <h1 className="text-2xl sm:text-4xl">
          Plan <span className="text-person-b">del hambre</span>
        </h1>
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
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col gap-3 rounded-r-3xl bg-paper p-4 shadow-brutal-lg">
              <div className="flex items-center justify-between">
                <span className="font-bold">Menú</span>
                <button
                  onClick={() => setOpen(false)}
                  className="press-brutal shadow-brutal-sm rounded-xl bg-white px-3 py-1 font-bold"
                  aria-label="Cerrar menú"
                >
                  ✕
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-col gap-4 pb-24 lg:pb-0">
          <OfflineBanner />
          <ExpiryBanner />
          <Outlet />
        </main>
      </div>

      {/* barra de pestañas inferior (solo móvil): plano, etiquetas claras */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${
                isActive ? 'text-person-b' : 'text-ink/45'
              }`
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold text-ink/45"
          aria-label="Más secciones"
        >
          <span className="text-xl leading-none">⋯</span>
          Más
        </button>
      </nav>
    </div>
  )
}
