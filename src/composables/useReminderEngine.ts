import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import {
  registerAppResumeListener,
  requestNotificationPermission,
  triggerImmediateAlert
} from '@/services/capacitorBridge'
import { sendTelegramReminder } from '@/services/telegramService'
import {
  formatCountdown,
  formatTimeHHMM,
  getCountdownSeconds,
  parseTimeToMinutes,
  toLocalDateKey
} from '@/utils/dateTime'
import { useMagangStore } from './useMagangStore'

export interface ActiveReminderAlert {
  title: string
  body: string
  isSessionWarning: boolean
}

/**
 * Coordinates the 1-second countdown to 17:00 Monev deadline, live portal status
 * sync prior to ringing alarms, minute-level local alarm evaluation, and Catch-Up Check.
 */
export function useReminderEngine() {
  const store = useMagangStore()
  const now = shallowRef(new Date())
  const lastCatchUpDate = shallowRef('')
  const activeAlert = shallowRef<ActiveReminderAlert | null>(null)

  let tickTimer: ReturnType<typeof setInterval> | null = null
  let cleanupResume: (() => void) | null = null

  const statusMeta = computed(() => {
    const rec = store.todayRecord.value
    const sched = store.schedule.value
    const nowMinutes = now.value.getHours() * 60 + now.value.getMinutes()
    const checkMinutes = parseTimeToMinutes(sched.monevCheckTime)

    if (
      rec.isHolidayOverride ||
      rec.status === 'libur' ||
      store.nationalHolidayToday.value
    ) {
      return {
        state: 'holiday' as const,
        badge: 'Libur / Izin',
        heading: 'Pengingat Dijeda Hari Ini',
        subtitle: 'Hari libur atau izin aktif, alarm Monev tidak dibunyikan.'
      }
    }

    if (rec.status === 'terisi') {
      return {
        state: 'filled' as const,
        badge: 'Sudah Diisi',
        heading: 'Monev Hari Ini Selesai',
        subtitle: 'Alarm pengingat dan snooze hari ini otomatis dibatalkan.'
      }
    }

    if (nowMinutes >= checkMinutes) {
      return {
        state: 'overdue' as const,
        badge: 'Belum Diisi!',
        heading: 'Waktunya Isi Absen Monev!',
        subtitle: `Sudah melewati pukul ${sched.monevCheckTime} ${sched.timezone}. Segera isi di portal Kemnaker.`
      }
    }

    return {
      state: 'pending' as const,
      badge: 'Belum Diisi',
      heading: 'Pengingat Monev MagangHub',
      subtitle: `Otomatis cek & bunyi pukul ${sched.monevCheckTime} ${sched.timezone} jika belum diisi.`
    }
  })

  const countdownSeconds = computed(() =>
    getCountdownSeconds(now.value, store.schedule.value.monevCheckTime)
  )

  const countdownText = computed(() => formatCountdown(countdownSeconds.value))

  function dismissAlert() {
    activeAlert.value = null
  }

  function showAlertBanner(alert: ActiveReminderAlert) {
    activeAlert.value = alert
  }

  async function evaluateAlarms(): Promise<void> {
    if (!store.isAuthenticated.value) return
    if (!store.isTodayWorkday.value) return
    if (store.todayRecord.value.status === 'terisi') return

    const currentHHMM = formatTimeHHMM(now.value)
    const todayKey = toLocalDateKey(now.value)

    for (const alarm of store.alarms.value) {
      if (!alarm.enabled) continue
      if (alarm.kind === 'snooze' && !store.schedule.value.snoozeEnabled) continue
      if (alarm.lastTriggeredDate === todayKey) continue
      if (alarm.time !== currentHHMM) continue

      await store.markAlarmTriggeredToday(alarm.id)

      // PRD Flow step 2-3: query real Monev portal status first if connected
      if (
        store.profile.value.portalSyncState !== 'disconnected' ||
        store.profile.value.portalAccessToken
      ) {
        const syncRes = await store.syncPortalStatus()
        if (syncRes.outcome === 'filled' || syncRes.outcome === 'off_day') {
          return
        }
        if (syncRes.outcome === 'session_expired') {
          const title = 'Sesi MagangHub Habis'
          const body =
            'Sesi MagangHub habis. Login & cek apakah Monev hari ini sudah diisi.'
          showAlertBanner({ title, body, isSessionWarning: true })
          await triggerImmediateAlert(title, body)
          await store.addNotification({ title, body, type: 'session_expired' })
          return
        }
      }

      const isSessionWarn = store.isSessionExpired.value
      const title = isSessionWarn ? 'Sesi MagangHub Habis' : alarm.title
      const body = isSessionWarn
        ? 'Sesi MagangHub habis. Login & cek apakah Monev hari ini sudah diisi.'
        : 'Absen Monev MagangHub hari ini belum diisi sampai batas jam kerja. Segera isi sekarang.'

      showAlertBanner({ title, body, isSessionWarning: isSessionWarn })
      await triggerImmediateAlert(title, body)
      await store.addNotification({
        title,
        body,
        type: isSessionWarn ? 'session_expired' : 'alarm'
      })

      if (
        store.profile.value.telegramBotToken &&
        store.profile.value.telegramChatId
      ) {
        await sendTelegramReminder(
          store.profile.value.telegramBotToken,
          store.profile.value.telegramChatId,
          `⏰ <b>${title}</b>\n${body}\nPortal: ${store.profile.value.portalUrl}`
        )
      }
    }
  }

  async function runCatchUpCheck(): Promise<void> {
    if (!store.isAuthenticated.value) return
    // Sync latest status from portal automatically on open/resume when connected
    if (
      store.profile.value.portalSyncState !== 'disconnected' ||
      store.profile.value.portalAccessToken
    ) {
      const syncRes = await store.syncPortalStatus()
      if (syncRes.outcome === 'filled' || syncRes.outcome === 'off_day') {
        return
      }
      if (syncRes.outcome === 'session_expired') {
        const title = 'Sesi MagangHub Habis'
        const body =
          'Sesi MagangHub habis. Login & cek apakah Monev hari ini sudah diisi.'
        showAlertBanner({ title, body, isSessionWarning: true })
        await store.addNotification({ title, body, type: 'session_expired' })
        return
      }
    }

    const todayKey = toLocalDateKey(new Date())
    if (lastCatchUpDate.value === todayKey) return
    if (!store.isCatchUpNeeded.value) return

    lastCatchUpDate.value = todayKey
    const title = `Pengingat Tertunda (Lewat ${store.schedule.value.monevCheckTime} ${store.schedule.value.timezone})`
    const body =
      'Anda belum mengisi absen Monev MagangHub hari ini. Buka portal Kemnaker sekarang.'

    showAlertBanner({
      title,
      body,
      isSessionWarning: store.isSessionExpired.value
    })
    await triggerImmediateAlert(title, body)
    await store.addNotification({ title, body, type: 'catch_up' })
  }

  onMounted(async () => {
    await store.initStore()
    await requestNotificationPermission()
    await runCatchUpCheck()

    tickTimer = setInterval(() => {
      now.value = new Date()
      if (now.value.getSeconds() === 0) {
        evaluateAlarms().catch(() => {})
      }
    }, 1000)

    cleanupResume = registerAppResumeListener(() => {
      now.value = new Date()
      runCatchUpCheck().catch(() => {})
      evaluateAlarms().catch(() => {})
    })
  })

  onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer)
    if (cleanupResume) cleanupResume()
  })

  return {
    now,
    statusMeta,
    countdownText,
    activeAlert,
    dismissAlert,
    showAlertBanner,
    runCatchUpCheck
  }
}
