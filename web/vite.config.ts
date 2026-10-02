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
      // 'prompt': a new version waits until the user chooses to reload (src/app/pwa.ts), so an update never
      // reloads the page under a photo that is being analysed. We register the SW ourselves (virtual:pwa-register).
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        // App shell + ORT glue/wasm are precached so the app starts offline after one online visit.
        // Both ORT variants are listed because the runtime picks at start-up (WebGPU build vs plain wasm build).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,mjs,wasm}'],
        // The model is deliberately NOT in the service-worker precache: the worker keeps it in its own Cache
        // Storage entry (src/worker/model-store.ts), which is written only after a session was created from it.
        globIgnores: ['**/model/**', '**/*.onnx'],
        // ort-wasm-simd-threaded.asyncify.wasm is ~25.5 MiB; workbox's default limit is 2 MiB.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
      manifest: {
        // One static manifest; the in-app UI switches between Indonesian and English by navigator.language.
        name: 'Stock Counter / Penghitung Stok',
        short_name: 'Stock Counter',
        description: 'Photograph a shelf and count products on-device, offline. Foto rak, hitung produk di perangkat.',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        lang: 'en',
        background_color: '#f4f5f7',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
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
