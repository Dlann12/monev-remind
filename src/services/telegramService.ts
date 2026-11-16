/**
 * FR-07 Optional client-side Telegram Bot Webhook escalation.
 * Token & Chat ID are stored locally in Dexie and only sent directly to api.telegram.org
 * if the user enables & triggers a message while online.
 */
export async function sendTelegramReminder(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const token = botToken.trim()
  const chat = chatId.trim()
  if (!token || !chat) {
    return { ok: false, error: 'Bot Token atau Chat ID belum diisi.' }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'Perangkat sedang offline. Pesan Telegram ditunda.' }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: message,
        parse_mode: 'HTML'
      })
    })
    if (!res.ok) {
      return { ok: false, error: `Telegram HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menghubungi Telegram API'
    }
  }
}

