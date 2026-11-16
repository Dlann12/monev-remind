# Monev MagangHub Auto-Reminder (Offline-First + Auto-Sync)

Aplikasi pengingat khusus pengisian absen **Monev MagangHub Kemnaker RI** berbasis **Vue 3 + TypeScript + Tailwind CSS + Dexie.js + Capacitor**, ringan untuk pratinjau instan di browser laptop dan dikompilasi otomatis menjadi **Android APK** via **GitHub Actions**.

## Bagaimana Koneksi ke Monev MagangHub Bekerja?
- **Pada APK Android (Otomatis Penuh):**
  1. Ketuk kartu koneksi `monev.maganghub.kemnaker.go.id` lalu login akun SIAPkerja Anda melalui **In-App Browser** (`@capacitor/inappbrowser`). Password tidak pernah disimpan oleh aplikasi.
  2. Plugin native `MonevSyncPlugin` membaca cookie sesi dari Android `CookieManager` untuk melakukan refresh sesi (`POST /api/v1/auth/refresh`) dan mengecek status hari ini (`GET /api/v1/users/me/home` → `has_attendance`, `is_scheduled_off_day`, `is_holiday`).
  3. Status otomatis dicek saat aplikasi dibuka/resume, setelah menutup portal, serta sebelum alarm pukul **17:00**, **17:30**, dan **18:00** berbunyi. Jika sudah terisi, alarm otomatis dibatalkan. Jika sesi habis (`401/403`), peringatan login ulang muncul.
- **Pada Pratinjau Browser Laptop (`npm run dev`):**
  - Karena kebijakan CORS browser menghalangi tab `localhost` mengakses cookie portal pemerintah secara langsung, tersedia **Vite dev proxy (`/monev-api`)** untuk pengujian live menggunakan `monev_access_token` sementara melalui modal koneksi portal.

## Pratinjau & Pengujian di Laptop
```bash
npm install
npm test
npm run dev
```

## Build Android APK via GitHub Actions
Push ke GitHub lalu jalankan workflow `.github/workflows/build-android.yml` di tab **Actions** dan unduh artefak **`maganghub-reminder-debug-apk`**.
