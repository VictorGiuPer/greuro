import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/greuro/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png', 'icon-192.png', 'logo.png'],
      manifest: {
        name: 'greuro',
        short_name: 'greuro',
        description: 'greuro · grow your euros. Local-first personal budgeting.',
        theme_color: '#0A0B0F',
        background_color: '#0A0B0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/greuro/',
        // Android's launcher pulls 192; the install dialog / splash uses 512.
        // Both sizes present keeps Chrome's installability check happy, which
        // is what lets `beforeinstallprompt` (our Install button) fire at all.
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
