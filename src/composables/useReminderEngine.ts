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
  shouldTriggerAutoFill2300,
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
 * sync prior to ringing alarms, minute-level local alarm evaluation, Catch-Up Check,
 * and automatic 23:00 fallback submission copying yesterday's daily log.
 */
export function useReminderEngine() {
  const store = useMagangStore()
  const now = shallowRef(new Date())
  const lastCatchUpDate = shallowRef('')
  const lastAutoFillHandledDate = shallowRef('')
  const activeAlert = shallowRef<ActiveReminderAlert | null>(null)

  let tickTimer: ReturnType<typeof setInterval> | null = null
  let cleanupResume: (() => void) | null = null

  const statusMeta = computed(() => {
    const rec = store.todayRecord.value
    const sched = store.schedule.value
    const nowMinutes = now.value.getHours() * 60 + now.value.getMinutes()
    const checkMinutes = parseTimeToMinutes(sched.monevCheckTime)

    if (rec.status === 'izin') {
      return {
        state: 'holiday' as const,
        badge: 'Izin',
        heading: 'Status Izin Aktif',
        subtitle: 'Hari ini tercatat Izin di portal Monev, pengingat dijeda.'
      }
    }

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
      const autoTime = sched.autoFillTime || '23:00'
      return {
        state: 'filled' as const,
        badge: rec.isAutoFilled ? 'Auto-Terisi' : 'Sudah Diisi',
        heading: rec.isAutoFilled
          ? 'Monev Hari Ini Diisi Otomatis'
          : 'Monev Hari Ini Selesai',
        subtitle: rec.isAutoFilled
          ? `Otomatis disalin dari kegiatan sebelumnya pada pukul ${autoTime} ${sched.timezone}.`
          : 'Alarm pengingat dan snooze hari ini otomatis dibatalkan.'
      }
    }

    if (nowMinutes >= checkMinutes) {
      const autoTime = sched.autoFillTime || '23:00'
      const autoFillNote = sched.autoFillAt2300
        ? ` Auto-isi berjalan pukul ${autoTime} ${sched.timezone} jika masih kosong.`
        : ''
      return {
        state: 'overdue' as const,
        badge: 'Belum Diisi!',
        heading: 'Waktunya Isi Absen Monev!',
        subtitle: `Sudah melewati pukul ${sched.monevCheckTime} ${sched.timezone}.${autoFillNote}`
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

  async function maybeAutoFillAt2300(): Promise<void> {
    if (!store.isAuthenticated.value) return
    const currentNow = now.value
    const todayKey = toLocalDateKey(currentNow)
    if (lastAutoFillHandledDate.value === todayKey) return

    if (
      !shouldTriggerAutoFill2300(
        currentNow,
        store.schedule.value,
        store.todayRecord.value
      )
    ) {
      return
    }

    const res = await store.runAutoFill2300()
    if (res.outcome !== 'unavailable') {
      lastAutoFillHandledDate.value = todayKey
    }
    const autoTime = store.schedule.value.autoFillTime || '23:00'
    if (res.outcome === 'submitted') {
      showAlertBanner({
        title: `Auto-Isi Monev ${autoTime} Berhasil`,
        body: res.message,
        isSessionWarning: false
      })
    } else if (res.outcome === 'session_expired') {
      showAlertBanner({
        title: `Auto-Isi Monev ${autoTime} Gagal (Sesi Habis)`,
        body: res.message,
        isSessionWarning: true
      })
    }
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
        : 'Jangan lupa isi monev! Absen Monev hari ini belum diisi.'

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

    await maybeAutoFillAt2300()
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

    await maybeAutoFillAt2300()
    if (store.todayRecord.value.status === 'terisi') return

    const todayKey = toLocalDateKey(new Date())
    if (lastCatchUpDate.value === todayKey) return
    if (!store.isCatchUpNeeded.value) return

    lastCatchUpDate.value = todayKey
    const title = `Pengingat Tertunda (Lewat ${store.schedule.value.monevCheckTime} ${store.schedule.value.timezone})`
    const body =
      'Jangan lupa isi monev! Anda belum mengisi absen Monev MagangHub hari ini.'

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
