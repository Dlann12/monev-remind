import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [vue()],
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
