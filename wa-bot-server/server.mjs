/**
 * MagangHub Reminder — Optional Central WhatsApp Bot Relay Server (Node.js 20+, zero npm dependencies)
 *
 * Deploy this tiny server (Railway, Render, Fly.io, VPS) so app users ONLY need
 * to enter their WhatsApp number without configuring any API keys.
 *
 * Supported upstream providers via environment variables:
 *   1. Fonnte (recommended for Indonesia):
 *        WA_UPSTREAM=fonnte
 *        FONNTE_TOKEN=<your_fonnte_device_token>
 *   2. Meta WhatsApp Cloud API:
 *        WA_UPSTREAM=cloud_api
 *        META_WA_TOKEN=<permanent_access_token>
 *        META_WA_PHONE_ID=<phone_number_id>
 *   3. Self-hosted WAHA / Baileys HTTP Gateway:
 *        WA_UPSTREAM=waha
 *        WAHA_BASE_URL=http://localhost:3000
 *        WAHA_SESSION=default
 *        WAHA_API_KEY=<optional_api_key>
 *
 * Optional security & server config:
 *   PORT=8787
 *   RELAY_SECRET=<optional_bearer_secret>
 */

import http from 'node:http'

const PORT = Number(process.env.PORT || 8787)
const UPSTREAM = (process.env.WA_UPSTREAM || 'fonnte').trim().toLowerCase()
const RELAY_SECRET = (process.env.RELAY_SECRET || '').trim()

// Simple per-phone in-memory rate limiter (max 10 requests / 10 minutes)
const rateBucket = new Map()
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 10

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

function isRateLimited(phone) {
  const now = Date.now()
  const list = (rateBucket.get(phone) || []).filter((ts) => now - ts < WINDOW_MS)
  if (list.length >= MAX_PER_WINDOW) {
    rateBucket.set(phone, list)
    return true
  }
  list.push(now)
  rateBucket.set(phone, list)
  return false
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  })
  res.end(JSON.stringify(payload))
}

async function dispatchUpstream(phone, message) {
  if (UPSTREAM === 'fonnte') {
    const token = (process.env.FONNTE_TOKEN || '').trim()
    if (!token) throw new Error('FONNTE_TOKEN belum diatur di environment server.')
    const body = new URLSearchParams({ target: phone, message, countryCode: '62' })
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}: ${text}`)
    return { provider: 'fonnte', response: text }
  }

  if (UPSTREAM === 'cloud_api') {
    const token = (process.env.META_WA_TOKEN || '').trim()
    const phoneId = (process.env.META_WA_PHONE_ID || '').trim()
    if (!token || !phoneId) {
      throw new Error('META_WA_TOKEN / META_WA_PHONE_ID belum diatur.')
    }
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message }
        })
      }
    )
    const text = await res.text()
    if (!res.ok) throw new Error(`Meta Cloud API HTTP ${res.status}: ${text}`)
    return { provider: 'cloud_api', response: text }
  }

  if (UPSTREAM === 'waha') {
    const base = (process.env.WAHA_BASE_URL || '').replace(/\/+$/, '')
    const session = (process.env.WAHA_SESSION || 'default').trim()
    const apiKey = (process.env.WAHA_API_KEY || '').trim()
    if (!base) throw new Error('WAHA_BASE_URL belum diatur.')
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['X-Api-Key'] = apiKey
    const res = await fetch(`${base}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session,
        chatId: `${phone}@c.us`,
        text: message
      })
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`WAHA HTTP ${res.status}: ${text}`)
    return { provider: 'waha', response: text }
  }

  throw new Error(`WA_UPSTREAM tidak dikenal: ${UPSTREAM}`)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end()
    return
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    writeJson(res, 200, { ok: true, service: 'maganghub-wa-bot-relay', upstream: UPSTREAM })
    return
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/api/wa/send')) {
    writeJson(res, 404, { ok: false, error: 'Endpoint tidak ditemukan. Gunakan POST /api/wa/send' })
    return
  }

  if (RELAY_SECRET) {
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (auth !== RELAY_SECRET) {
      writeJson(res, 401, { ok: false, error: 'Unauthorized relay secret.' })
      return
    }
  }

  try {
    const chunks = []
    let totalBytes = 0
    for await (const chunk of req) {
      totalBytes += chunk.length
      if (totalBytes > 16 * 1024) {
        writeJson(res, 413, { ok: false, error: 'Payload terlalu besar.' })
        return
      }
      chunks.push(chunk)
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
    const phone = normalizePhone(body.phone)
    const message = String(body.message || '').trim()

    if (phone.length < 10 || phone.length > 15) {
      writeJson(res, 400, { ok: false, error: 'Nomor WhatsApp tidak valid.' })
      return
    }
    if (!message || message.length > 2000) {
      writeJson(res, 400, { ok: false, error: 'Pesan tidak valid atau terlalu panjang.' })
      return
    }
    if (isRateLimited(phone)) {
      writeJson(res, 429, { ok: false, error: 'Terlalu banyak permintaan untuk nomor ini.' })
      return
    }

    const dispatched = await dispatchUpstream(phone, message)
    writeJson(res, 200, { ok: true, phone, ...dispatched })
  } catch (err) {
    writeJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'Internal relay error'
    })
  }
})

server.listen(PORT, () => {
  console.log(`MagangHub WA Bot Relay listening on :${PORT} (upstream=${UPSTREAM})`)
})
