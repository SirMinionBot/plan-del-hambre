import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Nada de pantallas en blanco: error brutalista + botón que purga SW y caché. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  async reset() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs ?? []).map((r) => r.unregister()))
      const keys = await caches?.keys?.()
      await Promise.all((keys ?? []).map((k) => caches.delete(k)))
    } finally {
      location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <div className="bg-ink p-4 font-bold uppercase text-paper" role="alert">
          Algo ha reventado: {this.state.error.message}
        </div>
        <button
          onClick={() => void this.reset()}
          className="border-brutal shadow-brutal press-brutal bg-warn px-4 py-3 font-bold uppercase"
        >
          Limpiar caché y recargar
        </button>
      </div>
    )
  }
}
