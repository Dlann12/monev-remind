/**
 * Vercel Cron Job — Auto-Fill Monev Pukul 23:00 WIB
 * Berjalan otomatis sesuai jadwal di vercel.json (Senin-Jumat 16:00 UTC = 23:00 WIB)
 */

const KEMNAKER_API_BASE = 'https://monev-api.maganghub.kemnaker.go.id/api/v1'
const MONEV_MIN_CHARS = 100

const DEFAULT_LOGS = {
  activity:
    'Melaksanakan rangkaian kegiatan operasional harian magang sesuai arahan mentor serta memastikan seluruh target tugas selesai tepat waktu.',
  lesson:
    'Memperoleh pemahaman praktis mengenai alur kerja tim, koordinasi operasional, komunikasi profesional, serta standar penyelesaian tugas harian di lingkungan magang.',
  obstacles:
    'Tidak terdapat kendala signifikan selama pelaksanaan kegiatan hari ini; seluruh koordinasi pekerjaan dan penyelesaian tugas bersama tim berjalan lancar sesuai rencana.'
}

function padText(text, kind) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  if (cleaned.length >= MONEV_MIN_CHARS) return cleaned
  if (!cleaned) return DEFAULT_LOGS[kind]
  const sep = /[.!?]$/.test(cleaned) ? ' ' : '. '
  const suffix =
    kind === 'activity'
      ? 'Kegiatan dilaksanakan secara konsisten bersama tim sesuai arahan mentor lapangan dan target evaluasi harian program magang.'
      : kind === 'lesson'
        ? 'Pembelajaran ini meningkatkan pemahaman terhadap alur kerja tim, standar kualitas operasional, serta ketepatan koordinasi harian di tempat magang.'
        : 'Kendala yang ditemui dapat diatasi dengan baik melalui koordinasi bersama mentor dan rekan tim sehingga seluruh tugas harian tetap berjalan lancar.'
  return `${cleaned}${sep}${suffix}`
}

async function sendTelegramAlert(botToken, chatId, message) {
  if (!botToken || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    })
  } catch (err) {
    console.warn('[Telegram Alert Error]:', err)
  }
}

export default async function handler(req, res) {
  // 1. Verifikasi keamanan CRON_SECRET (opsional, jika disetel di Vercel Env)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' })
    }
  }

  // 2. Ambil daftar akun dari Environment Variables
  // Bisa berupa JSON array: [{"name": "Ageng", "token": "...", "telegramChatId": "..."}]
  // Atau single token: MONEV_ACCESS_TOKEN
  let accounts = []
  if (process.env.MONEV_ACCOUNTS) {
    try {
      const parsed = JSON.parse(process.env.MONEV_ACCOUNTS)
      if (Array.isArray(parsed)) accounts = parsed
    } catch {
      console.warn('Gagal parse MONEV_ACCOUNTS JSON')
    }
  }

  if (accounts.length === 0 && process.env.MONEV_ACCESS_TOKEN) {
    accounts.push({
      name: 'Peserta',
      token: process.env.MONEV_ACCESS_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID
    })
  }

  if (accounts.length === 0) {
    return res.status(200).json({
      message: 'Tidak ada akun yang dikonfigurasi di Environment Variables (MONEV_ACCOUNTS / MONEV_ACCESS_TOKEN).'
    })
  }

  const globalBotToken = process.env.TELEGRAM_BOT_TOKEN
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

  const results = []

  // 3. Proses auto-fill untuk setiap akun terdaftar
  for (const acc of accounts) {
    const token = (acc.token || '').replace(/^Bearer\s+/i, '').trim()
    const name = acc.name || 'Peserta'
    const chatId = acc.telegramChatId || process.env.TELEGRAM_CHAT_ID

    if (!token) {
      results.push({ name, status: 'skipped', reason: 'Token kosong' })
      continue
    }

    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: 'https://monev.maganghub.kemnaker.go.id',
      Referer: 'https://monev.maganghub.kemnaker.go.id/'
    }

    try {
      // Cek status hari ini
      const homeRes = await fetch(`${KEMNAKER_API_BASE}/users/me/home`, { headers })
      if (homeRes.status === 401 || homeRes.status === 403) {
        results.push({ name, status: 'session_expired' })
        await sendTelegramAlert(
          globalBotToken,
          chatId,
          `⚠️ <b>Auto-Monev 23:00 Gagal untuk ${name}</b>\nSesi MagangHub Anda berakhir. Silakan login ulang dan perbarui token.`
        )
        continue
      }

      const homeJson = await homeRes.json().catch(() => ({}))
      const homeData = homeJson.data || homeJson

      if (homeData.has_attendance) {
        results.push({ name, status: 'already_filled', note: 'Sudah diisi sebelumnya' })
        continue
      }

      if (homeData.is_scheduled_off_day || homeData.is_holiday) {
        results.push({ name, status: 'off_day', note: 'Hari libur / tidak ada jadwal' })
        continue
      }

      // Ambil user ID untuk mencari log kegiatan sebelumnya
      const userRes = await fetch(`${KEMNAKER_API_BASE}/users/me`, { headers })
      const userJson = await userRes.json().catch(() => ({}))
      const userId = userJson.data?.id || userJson.id

      let draft = null
      if (userId) {
        const curDate = new Date()
        const curMonth = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}-01`
        const logsRes = await fetch(
          `${KEMNAKER_API_BASE}/daily-logs?participant_id=${userId}&date=${curMonth}&limit=100`,
          { headers }
        )
        if (logsRes.ok) {
          const logsJson = await logsRes.json().catch(() => ({}))
          const logsList = Array.isArray(logsJson.data) ? logsJson.data : []
          const sorted = logsList
            .filter((l) => l.date && l.date.slice(0, 10) < todayKey)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          if (sorted.length > 0) {
            draft = sorted[0]
          }
        }
      }

      const payload = {
        date: todayKey,
        status: 'PRESENT',
        activity_log: padText(draft?.activity_log, 'activity'),
        lesson_learned: padText(draft?.lesson_learned, 'lesson'),
        obstacles: padText(draft?.obstacles, 'obstacles')
      }

      // Kirim auto-fill
      const postRes = await fetch(`${KEMNAKER_API_BASE}/attendances/with-daily-log`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (postRes.ok) {
        results.push({ name, status: 'submitted', date: todayKey })
        await sendTelegramAlert(
          globalBotToken,
          chatId,
          `✅ <b>Auto-Monev 23:00 Berhasil (${name})</b>\nAbsensi tanggal ${todayKey} telah berhasil diisi otomatis ke portal MagangHub Kemnaker.`
        )
      } else {
        const postErr = await postRes.text().catch(() => '')
        results.push({ name, status: 'error', httpStatus: postRes.status, error: postErr })
        await sendTelegramAlert(
          globalBotToken,
          chatId,
          `❌ <b>Auto-Monev 23:00 Gagal (${name})</b>\nServer Kemnaker merespons status ${postRes.status}.`
        )
      }
    } catch (err) {
      results.push({ name, status: 'error', error: err.message })
    }
  }

  return res.status(200).json({
    success: true,
    executionTimeWIB: `${todayKey} 23:00`,
    totalAccounts: accounts.length,
    results
  })
}
