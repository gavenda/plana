import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// The Bun server (src/server) is the front door on PORT. In development it proxies
// asset + HMR requests through to this Vite dev server, so Vite never needs to be
// the thing the browser talks to for navigation requests.
const VITE_DEV_PORT = Number(process.env.VITE_DEV_PORT ?? 5174)

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    vue(),
    tailwindcss(),
    // The devtools plugin injects client-only code; keep it out of the SSR bundle.
    ...(isSsrBuild ? [] : [vueDevTools()]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: VITE_DEV_PORT,
    strictPort: true,
    // The document is served from the Bun server's origin, so point the HMR client
    // straight at Vite instead of letting it guess the page origin.
    hmr: { protocol: 'ws', host: 'localhost', port: VITE_DEV_PORT, clientPort: VITE_DEV_PORT },
  },
  build: {
    emptyOutDir: true,
  },
}))
