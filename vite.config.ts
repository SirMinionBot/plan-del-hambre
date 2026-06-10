import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  // GitHub Pages sirve bajo /plan-del-hambre/; el workflow exporta DEPLOY_BASE
  const base = process.env.DEPLOY_BASE ?? '/'
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // injectManifest: service worker propio (src/sw.ts) para manejar Web Push
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'PLAN DEL HAMBRE',
          short_name: 'HAMBRE',
          description: 'Qué comemos esta semana, sin discutir. Planificador de comidas para dos.',
          lang: 'es',
          display: 'standalone',
          scope: base,
          start_url: base,
          background_color: '#f4f1ea',
          theme_color: '#f4f1ea',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // mantener pulsado el icono → accesos directos
          shortcuts: [
            { name: 'La compra', url: `${base}compra`, icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
            { name: 'Planificar semana', url: `${base}planificar`, icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
            { name: 'Despensa', url: `${base}despensa`, icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          ],
        },
      }),
    ],
  }
})
