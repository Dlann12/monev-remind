#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(rootDir, 'dist')
const extensionDistDir = resolve(rootDir, 'dist-extension')
const extensionSrcDir = resolve(rootDir, 'src/extension')

console.log('🚀 Membangun ekstensi browser MagangHub Reminder...')

// 1. Jalankan build Vue + Vite
console.log('📦 Menjalankan npm run build...')
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' })

// 2. Siapkan folder dist-extension
if (existsSync(extensionDistDir)) {
  rmSync(extensionDistDir, { recursive: true, force: true })
}
mkdirSync(extensionDistDir, { recursive: true })

// 3. Salin hasil build dist/ ke dist-extension/
console.log('📋 Menyalin aset aplikasi...')
cpSync(distDir, extensionDistDir, { recursive: true })

// 4. Salin file khusus ekstensi (manifest.json, rules.json, background.js)
console.log('⚙️  Menyisipkan file konfigurasi Manifest V3...')
cpSync(resolve(extensionSrcDir, 'manifest.json'), resolve(extensionDistDir, 'manifest.json'))
cpSync(resolve(extensionSrcDir, 'rules.json'), resolve(extensionDistDir, 'rules.json'))
cpSync(resolve(extensionSrcDir, 'background.js'), resolve(extensionDistDir, 'background.js'))

console.log(`
✅ Ekstensi browser siap digunakan!
📁 Lokasi output: ${extensionDistDir}

👉 Cara memasang di Google Chrome / Brave / Microsoft Edge di Linux/Windows:
1. Buka browser dan ketik di address bar: chrome://extensions
2. Aktifkan sakelar "Developer mode" (Mode Pengembang) di pojok kanan atas.
3. Klik tombol "Load unpacked" (Muat yang belum dibongkar) di pojok kiri atas.
4. Pilih folder:
   ${extensionDistDir}
5. Ekstensi "MagangHub Reminder" langsung aktif di browser Anda!
`)
