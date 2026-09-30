import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devFixtures, ISOLATION_HEADERS, ortAliases, ortRuntimeFiles } from './devtools/vite-plugins.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ortRuntimeFiles(),
    devFixtures(),
    VitePWA({
      registerType: 'autoUpdate',
      // ORT glue/wasm (14-27 MB each) exceed workbox's 2 MiB precache limit and fail the build.
      // Phase 5 decides how ORT is precached; until then it is served from dist/ort/ but not in the SW manifest.
      workbox: { globIgnores: ['ort/**'] },
      manifest: {
        name: 'Penghitung Stok',
        short_name: 'Stok',
        description: 'Foto rak, hitung stok otomatis.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f3f4f6',
        theme_color: '#1d4ed8',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  resolve: {
    // ORT-web extern-wasm entries: the Emscripten glue/wasm are NOT bundled; they are loaded at
    // runtime from `${BASE_URL}ort/` so pthread workers spawn from the glue file, not our chunk.
    alias: ortAliases(),
  },
  // Workers use dynamic import() (ORT variant chosen at runtime) -> ES format, not the iife default.
  worker: { format: 'es' },
  server: { headers: { ...ISOLATION_HEADERS } },
  preview: { headers: { ...ISOLATION_HEADERS } },
})
