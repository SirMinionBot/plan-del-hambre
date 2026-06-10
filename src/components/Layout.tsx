import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../hooks/useHousehold'
import { Banner } from './ui/Banner'
import type { PantryItem } from '../types/db'

const NAV = [
  { to: '/', label: 'Calendario' },
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

export function Layout() {
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-3 pb-12">
      <header className="border-b-4 border-ink py-4">
        <h1 className="text-2xl font-bold sm:text-4xl">Plan del hambre</h1>
      </header>
      <nav className="mb-6 grid grid-cols-4 border-brutal border-t-0 sm:grid-cols-7">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `border-2 border-ink px-1 py-2 text-center text-xs font-bold uppercase sm:text-sm ${
                isActive ? 'bg-ink text-paper' : 'bg-white hover:bg-warn'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <ExpiryBanner />
      <main className="mt-4">
        <Outlet />
      </main>
    </div>
  )
}
