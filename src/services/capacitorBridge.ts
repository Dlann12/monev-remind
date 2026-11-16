import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import type { AlarmRule, ScheduleConfig } from '@/types/app'
import { playReminderChime } from '@/utils/audio'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      const perm = await LocalNotifications.requestPermissions()
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
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483647),
            title,
            body,
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
 * Syncs recurring native Android local notifications on Capacitor.
 * Automatically cancels snooze alarms once today's Monev is marked filled.
 */
export async function syncNativeAlarms(
  alarms: ReadonlyArray<AlarmRule>,
  schedule: ScheduleConfig,
  todayFilled: boolean
): Promise<void> {
  if (!isNativePlatform()) return

  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id }))
      })
    }

    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return

    const notifications = alarms
      .filter((a) => a.enabled)
      .filter((a) => !(a.kind === 'snooze' && (todayFilled || !schedule.snoozeEnabled)))
      .map((alarm, index) => {
        const [hourStr, minuteStr] = alarm.time.split(':')
        const hour = Number(hourStr) || 17
        const minute = Number(minuteStr) || 0

        return {
          id: 100 + index,
          title: alarm.title,
          body: 'Monev MagangHub hari ini belum ditandai terisi. Buka portal sekarang!',
          schedule: {
            on: { hour, minute },
            repeats: true,
            allowWhileIdle: true
          }
        }
      })

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
      if (isActive) onResume()
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
