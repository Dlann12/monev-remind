/**
 * MagangHub Reminder — Extension Background Service Worker
 */

const REMINDER_ALARM_NAME = 'monev_heartbeat'

chrome.runtime.onInstalled.addListener(() => {
  // Setup heartbeat alarm for periodic reminder check (every 15 minutes)
  chrome.alarms.create(REMINDER_ALARM_NAME, {
    periodInMinutes: 15
  })

  // Configure Side Panel behavior if available (Chrome 114+)
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
  }
})

// Listen to scheduled alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM_NAME) {
    checkAndNotifyMonev()
  }
})

// Notification click opens portal
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('monev_')) {
    chrome.tabs.create({ url: 'https://monev.maganghub.kemnaker.go.id/' })
  }
})

async function checkAndNotifyMonev() {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // Standard reminder window: between 17:00 and 23:30
  if (currentHour >= 17 && currentHour <= 23) {
    try {
      // Show notification if today's reminder hasn't been acknowledged or during target hours
      const todayKey = now.toISOString().slice(0, 10)
      const storageKey = `last_notif_${todayKey}_${currentHour}`
      const data = await chrome.storage.local.get([storageKey])

      if (!data[storageKey]) {
        chrome.notifications.create(`monev_alert_${Date.now()}`, {
          type: 'basic',
          iconUrl: 'app-logo.png',
          title: 'Pengingat Monev MagangHub • Kemnaker RI',
          message:
            currentHour === 23
              ? 'Pukul 23:00 — Segera periksa pengisian Monev hari ini sebelum berganti hari!'
              : 'Waktunya isi Monev! Pastikan catatan kegiatan harian Anda sudah terisi.',
          priority: 2
        })
        await chrome.storage.local.set({ [storageKey]: true })
      }
    } catch (err) {
      console.warn('[Background] Error checking monev:', err)
    }
  }
}
