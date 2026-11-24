import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['app-logo.png', 'sounds/reminder.mp3'],
      manifest: {
        name: 'MagangHub Auto-Reminder • Kemnaker RI',
        short_name: 'MagangHub Reminder',
        description: 'Pengingat dan Auto-Isi Monev Harian MagangHub Kemnaker RI',
        theme_color: '#0267FF',
        background_color: '#f8f9ff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'app-logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'app-logo.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'app-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,mp3}']
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/monev-api': {
        target: 'https://monev-api.maganghub.kemnaker.go.id',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/monev-api/, '/api/v1'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'https://monev.maganghub.kemnaker.go.id')
            proxyReq.setHeader('Referer', 'https://monev.maganghub.kemnaker.go.id/')
          })
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
