import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import type { AlarmRule, MonevRecord, ScheduleConfig } from '@/types/app'
import { playReminderChime } from '@/utils/audio'
import { getZonedTargetInstant, isWorkdayActive } from '@/utils/dateTime'
import { MonevSync } from '@/services/monevPortalService'

export const MONEV_NOTIFICATION_CHANNEL_ID = 'monev_voice_alarm_v1'
export const MONEV_CUSTOM_SOUND_FILE = 'reminder_sound.mp3'

let channelInitialized = false

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export async function ensureNotificationChannel(): Promise<void> {
  if (!isNativePlatform() || channelInitialized) return

  try {
    await LocalNotifications.createChannel({
      id: MONEV_NOTIFICATION_CHANNEL_ID,
      name: 'Pengingat Suara Monev',
      description: 'Notifikasi suara pengingat dan auto-isi Monev MagangHub',
      sound: MONEV_CUSTOM_SOUND_FILE,
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#006972'
    })
    channelInitialized = true
  } catch {
    // Ignore channel setup errors on non-Android platforms
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      const perm = await LocalNotifications.requestPermissions()
      await ensureNotificationChannel()
      return perm.display === 'granted'
    } catch {
      return false
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true
    if (Notification.permission !== 'denied') {
      const res = await Notification.requestPermission()
      return res === 'granted'
    }
  }
  return false
}

export async function triggerImmediateAlert(
  title: string,
  body: string
): Promise<void> {
  playReminderChime()

  if (isNativePlatform()) {
    try {
      await ensureNotificationChannel()
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483647),
            title,
            body,
            channelId: MONEV_NOTIFICATION_CHANNEL_ID,
            sound: MONEV_CUSTOM_SOUND_FILE,
            schedule: { at: new Date(Date.now() + 400) },
            smallIcon: 'ic_stat_alarm'
          }
        ]
      })
      return
    } catch {
      // Fallback below
    }
  }

  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, { body })
    } catch {
      // Some mobile webviews disallow Notification constructor directly
    }
  }
}

/**
 * Stops any actively ringing native alarm audio on Android.
 */
export async function stopNativeAlarmAudio(): Promise<void> {
  if (!isNativePlatform()) return
  try {
    await MonevSync.stopAlarmAudio()
  } catch {
    // Ignore if plugin not ready
  }
}

/**
 * Syncs recurring native Android local notifications and AlarmManager.setAlarmClock.
 * Automatically cancels snooze alarms once today's Monev is marked filled.
 */
export async function syncNativeAlarms(
  alarms: ReadonlyArray<AlarmRule>,
  schedule: ScheduleConfig,
  todayFilled: boolean,
  todayRecord?: MonevRecord | null
): Promise<void> {
  if (!isNativePlatform()) return

  // 1. Sync Native AlarmClock via AlarmManager (wakes deep Doze at exact wall-clock millisecond)
  try {
    const enabledList = alarms.filter((a) => a.enabled)
    await MonevSync.syncNativeAlarmClocks({
      alarms: enabledList.map((a) => ({
        id: a.id,
        title: a.title,
        time: a.time,
        enabled: a.enabled,
        kind: a.kind
      })),
      timezone: schedule.timezone,
      workDaysCsv: schedule.workDays.join(','),
      holidayOverrideDate:
        todayRecord && todayRecord.isHolidayOverride ? todayRecord.date : '',
      todayFilled,
      snoozeEnabled: schedule.snoozeEnabled
    })

    if (todayFilled) {
      await stopNativeAlarmAudio()
    }
  } catch {
    // Ignore fallback below
  }

  // 2. Sync LocalNotifications as secondary redundancy
  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id }))
      })
    }

    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return

    await ensureNotificationChannel()

    const now = new Date()
    const enabledAlarms = alarms.filter((a) => a.enabled)
    const notifications: Array<{
      id: number
      title: string
      body: string
      channelId: string
      sound: string
      smallIcon: string
      schedule: {
        at: Date
        allowWhileIdle: boolean
      }
    }> = []

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      for (let index = 0; index < enabledAlarms.length; index += 1) {
        const alarm = enabledAlarms[index]
        if (!alarm) continue
        if (alarm.kind === 'snooze' && !schedule.snoozeEnabled) continue
        if (dayOffset === 0 && todayFilled) continue

        const { fireAt, dateKey } = getZonedTargetInstant(
          now,
          dayOffset,
          alarm.time,
          schedule.timezone
        )
        if (fireAt.getTime() <= now.getTime()) continue

        const recordForDay =
          todayRecord && todayRecord.date === dateKey ? todayRecord : null
        if (!isWorkdayActive(fireAt, schedule, recordForDay)) continue

        notifications.push({
          id: 1000 + index * 10 + dayOffset,
          title: alarm.title,
          body: 'Monev MagangHub hari ini belum diisi. Jangan lupa isi monev sekarang!',
          channelId: MONEV_NOTIFICATION_CHANNEL_ID,
          sound: MONEV_CUSTOM_SOUND_FILE,
          smallIcon: 'ic_stat_alarm',
          schedule: {
            at: fireAt,
            allowWhileIdle: true
          }
        })
      }
    }

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications })
    }
  } catch {
    // Ignore native sync error in unsupported environments
  }
}

export function registerAppResumeListener(onResume: () => void): () => void {
  if (isNativePlatform()) {
    const handlePromise = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        stopNativeAlarmAudio().catch(() => {})
        onResume()
      }
    })
    return () => {
      handlePromise.then((h) => h.remove()).catch(() => {})
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      onResume()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
