# MagangHub WA Bot Relay Server (Opsional)

Server relay ringan berbasis **Node.js 20+** (tanpa `npm install` / zero dependencies) agar pengguna aplikasi MagangHub Reminder cukup memasukkan **Nomor WhatsApp saja** tanpa harus membuat API Key masing-masing.

## Cara Deploy Cepat (Railway / Render / Fly.io / VPS)

1. Jalankan file `server.mjs`:
   ```bash
   WA_UPSTREAM=fonnte FONNTE_TOKEN=TOKEN_FONNTE_ANDA PORT=8787 node wa-bot-server/server.mjs
   ```
   Provider upstream yang didukung lewat environment variable:
   - **Fonnte (`WA_UPSTREAM=fonnte`)**: set `FONNTE_TOKEN`
   - **Meta WhatsApp Cloud API (`WA_UPSTREAM=cloud_api`)**: set `META_WA_TOKEN` & `META_WA_PHONE_ID`
   - **Self-hosted WAHA / Baileys (`WA_UPSTREAM=waha`)**: set `WAHA_BASE_URL`, `WAHA_SESSION`, opsional `WAHA_API_KEY`
   - Opsional keamanan: set `RELAY_SECRET` (Bearer token)

2. Setelah server online (misal `https://bot-wa-kamu.up.railway.app`), pasang endpointnya ke APK otomatis:
   - Buka GitHub repo → **Settings → Secrets and variables → Actions → Variables**
   - Tambah Repository Variable:
     - Name: `VITE_WA_BOT_RELAY_URL`
     - Value: `https://bot-wa-kamu.up.railway.app/api/wa/send`
   - Setiap APK baru yang di-build GitHub Actions akan otomatis menjadikan **Server Bot WA** sebagai default — pengguna tinggal ketik **No. WA** lalu klik **Simpan & Uji Kirim WA**!

3. Tanpa server sendiri? Pengguna tetap bisa langsung memakai mode **CallMeBot (Gratis)** atau **Fonnte** langsung dari tab **Jadwal & Alarm** di aplikasi.
