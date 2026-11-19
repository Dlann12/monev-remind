import { Capacitor } from '@capacitor/core'
import type { WhatsAppProvider } from '@/types/app'
import { MonevSync } from './monevPortalService'

export interface WhatsAppReminderConfig {
  enabled: boolean
  provider: WhatsAppProvider
  phone: string
  apiKey?: string
  webhookUrl?: string
}

export interface WhatsAppSendResult {
  ok: boolean
  error?: string
}

export const CALLMEBOT_BOT_PHONE = '+34 644 51 95 23'
export const CALLMEBOT_ACTIVATION_TEXT = 'I allow callmebot to send me messages'
export const CALLMEBOT_GUIDE_URL =
  'https://www.callmebot.com/blog/free-api-whatsapp-messages/'

export const DEFAULT_WA_RELAY_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_WA_BOT_RELAY_URL
    ? String(import.meta.env.VITE_WA_BOT_RELAY_URL).trim()
    : ''

export function getCallMeBotActivationUrl(): string {
  return `https://wa.me/34644519523?text=${encodeURIComponent(CALLMEBOT_ACTIVATION_TEXT)}`
}

/**
 * Normalizes Indonesian or international WhatsApp numbers into digits-only E.164
 * without leading '+' (e.g., "0812-3456-789" -> "628123456789").
 */
export function normalizeIndonesianPhone(raw: string): string {
  const digits = (raw || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) {
    return digits.slice(2)
  }
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`
  }
  if (digits.startsWith('8')) {
    return `62${digits}`
  }
  return digits
}

export function isValidWhatsAppPhone(raw: string): boolean {
  const normalized = normalizeIndonesianPhone(raw)
  return normalized.length >= 10 && normalized.length <= 15
}

export function resolveEffectiveRelayUrl(webhookUrl?: string): string {
  return (webhookUrl || '').trim() || DEFAULT_WA_RELAY_URL
}

/**
 * Persists WhatsApp config to Android SharedPreferences so background
 * AutoMonevReceiver (23:00 auto-fill) can also dispatch WhatsApp notifications.
 */
export async function syncNativeWhatsAppConfig(
  config: WhatsAppReminderConfig
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const phone = normalizeIndonesianPhone(config.phone)
  const effectiveUrl =
    config.provider === 'relay'
      ? resolveEffectiveRelayUrl(config.webhookUrl)
      : (config.webhookUrl || '').trim()

  await MonevSync.saveWhatsAppConfig({
    enabled: Boolean(config.enabled && phone),
    provider: config.provider,
    phone,
    apiKey: (config.apiKey || '').trim(),
    webhookUrl: effectiveUrl
  }).catch(() => {})
}

/**
 * Sends a WhatsApp reminder via:
 * - 'relay': Developer-hosted Bot Relay Server (user only needs No. WA)
 * - 'callmebot': Free personal CallMeBot WhatsApp Bot (No. WA + API Key)
 * - 'fonnte': Fonnte WhatsApp Gateway (No. WA + Fonnte Token)
 * - 'webhook': Custom Webhook / Baileys / WAHA / n8n endpoint
 *
 * On Capacitor Android, requests execute natively in Java (no CORS restrictions).
 */
export async function sendWhatsAppReminder(
  config: WhatsAppReminderConfig,
  message: string
): Promise<WhatsAppSendResult> {
  if (!config.enabled) {
    return { ok: false, error: 'Pengingat WhatsApp belum diaktifkan.' }
  }

  const phone = normalizeIndonesianPhone(config.phone)
  if (!isValidWhatsAppPhone(phone)) {
    return { ok: false, error: 'Nomor WhatsApp tidak valid (contoh: 081234567890).' }
  }

  const apiKey = (config.apiKey || '').trim()
  const webhookUrl =
    config.provider === 'relay'
      ? resolveEffectiveRelayUrl(config.webhookUrl)
      : (config.webhookUrl || '').trim()

  if (config.provider === 'callmebot' && !apiKey) {
    return { ok: false, error: 'API Key CallMeBot belum diisi.' }
  }
  if (config.provider === 'fonnte' && !apiKey) {
    return { ok: false, error: 'Token Fonnte belum diisi.' }
  }
  if ((config.provider === 'relay' || config.provider === 'webhook') && !webhookUrl) {
    return {
      ok: false,
      error:
        config.provider === 'relay'
          ? 'URL Server Bot WA belum dikonfigurasi. Isi URL server bot atau pilih CallMeBot / Fonnte.'
          : 'URL Webhook Bot WA belum diisi.'
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Perangkat sedang offline. Pesan WhatsApp ditunda.' }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await MonevSync.sendWhatsAppMessage({
        provider: config.provider,
        phone,
        apiKey,
        webhookUrl,
        message
      })
      return res.ok
        ? { ok: true }
        : { ok: false, error: res.error || `WhatsApp HTTP ${res.httpStatus ?? 0}` }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Gagal mengirim pesan WhatsApp native.'
      }
    }
  }

  try {
    if (config.provider === 'callmebot') {
      const url = `https://api.callmebot.com/whatsapp.php?phone=+${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) {
        return { ok: false, error: `CallMeBot HTTP ${res.status}` }
      }
      return { ok: true }
    }

    if (config.provider === 'fonnte') {
      const body = new URLSearchParams({
        target: phone,
        message,
        countryCode: '62'
      })
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      })
      if (!res.ok) {
        return { ok: false, error: `Fonnte HTTP ${res.status}` }
      }
      try {
        const json = (await res.json()) as { status?: boolean; reason?: string }
        if (json.status === false) {
          return { ok: false, error: json.reason || 'Fonnte menolak pengiriman pesan.' }
        }
      } catch {
        // Non-JSON 200 response
      }
      return { ok: true }
    }

    // 'relay' or 'webhook'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        message,
        source: 'maganghub-reminder'
      })
    })
    if (!res.ok) {
      return { ok: false, error: `Bot Server HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Gagal menghubungi gateway WhatsApp (periksa jaringan / CORS).'
    }
  }
}
