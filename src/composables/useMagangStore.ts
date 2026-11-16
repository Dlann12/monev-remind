import { computed, readonly, ref, shallowRef } from 'vue'
import {
  DEFAULT_ALARMS,
  DEFAULT_PROFILE,
  DEFAULT_SCHEDULE,
  db,
  seedInitialData
} from '@/db/database'
import {
  syncNativeAlarms,
  triggerImmediateAlert
} from '@/services/capacitorBridge'
import {
  checkMonevTodayStatus,
  clearPortalSessionCookie,
  computeInitials,
  openMonevPortalInApp,
  type MonevStatusCheckResult
} from '@/services/monevPortalService'
import { sendTelegramReminder } from '@/services/telegramService'
import type {
  AlarmRule,
  InternProfile,
  MonevRecord,
  NotificationLog,
  ScheduleConfig
} from '@/types/app'
import {
  getNationalHolidayName,
  isSessionLikelyExpired,
  isWorkdayActive,
  shouldTriggerCatchUp,
  toLocalDateKey
} from '@/utils/dateTime'

const isInitialized = shallowRef(false)
const isLoading = shallowRef(true)
const isSyncingPortal = shallowRef(false)

const profile = ref<InternProfile>({ ...DEFAULT_PROFILE })
const schedule = ref<ScheduleConfig>({ ...DEFAULT_SCHEDULE })
const alarms = ref<AlarmRule[]>([...DEFAULT_ALARMS])
const records = ref<MonevRecord[]>([])
const notifications = ref<NotificationLog[]>([])

function createDefaultTodayRecord(dateKey: string): MonevRecord {
  return {
    date: dateKey,
    status: 'belum',
    filledAt: null,
    isHolidayOverride: false
  }
}

export function useMagangStore() {
  const todayKey = computed(() => toLocalDateKey(new Date()))

  const todayRecord = computed<MonevRecord>(() => {
    const found = records.value.find((r) => r.date === todayKey.value)
    return found ?? createDefaultTodayRecord(todayKey.value)
  })

  const nationalHolidayToday = computed(() =>
    getNationalHolidayName(todayKey.value)
  )

  const isTodayWorkday = computed(() =>
    isWorkdayActive(new Date(), schedule.value, todayRecord.value)
  )

  const activeAlarmsCount = computed(
    () => alarms.value.filter((a) => a.enabled).length
  )

  const unreadNotificationsCount = computed(
    () => notifications.value.filter((n) => !n.read).length
  )

  const isSessionExpired = computed(() => {
    if (profile.value.portalSyncState === 'session_expired') return true
    if (profile.value.portalSyncState === 'connected') {
      return isSessionLikelyExpired(
        profile.value.sessionLastVerifiedAt,
        profile.value.sessionTimeoutHours
      )
    }
    return false
  })

  const isAuthenticated = computed(() => {
    if (profile.value.portalSyncState === 'connected') return true
    if (
      profile.value.portalSyncState === 'unavailable' &&
      Boolean(profile.value.portalUserId || profile.value.sessionLastVerifiedAt)
    ) {
      return true
    }
    return false
  })

  const isCatchUpNeeded = computed(() =>
    shouldTriggerCatchUp(new Date(), schedule.value, todayRecord.value)
  )

  const complianceStats = computed(() => {
    const activeRecords = records.value.filter((r) => r.status !== 'libur')
    const filled = activeRecords.filter((r) => r.status === 'terisi').length
    const onLeave = activeRecords.filter((r) => r.status === 'izin').length
    const missed = activeRecords.filter((r) => r.status === 'terlewat').length
    const total = activeRecords.length
    const percentage =
      total === 0
        ? 0
        : Math.min(100, Math.round(((filled + onLeave) / total) * 100))
    return { filled, onLeave, missed, total, percentage }
  })

  async function initStore(): Promise<void> {
    if (isInitialized.value) return
    isLoading.value = true
    try {
      await seedInitialData()
      await reloadAll()
      isInitialized.value = true
    } catch {
      alarms.value = [...DEFAULT_ALARMS]
      isInitialized.value = true
    } finally {
      isLoading.value = false
    }
  }

  async function reloadAll(): Promise<void> {
    const [p, s, al, rec, notif] = await Promise.all([
      db.profile.get('default'),
      db.schedule.get('default'),
      db.alarms.toArray(),
      db.records.orderBy('date').reverse().toArray(),
      db.notifications.orderBy('id').reverse().limit(50).toArray()
    ])

    if (p) profile.value = { ...DEFAULT_PROFILE, ...p }
    if (s) schedule.value = { ...DEFAULT_SCHEDULE, ...s }
    alarms.value = al.length > 0 ? al : [...DEFAULT_ALARMS]
    records.value = rec
    notifications.value = notif
  }

  async function syncAlarmsToDevice(): Promise<void> {
    await syncNativeAlarms(
      alarms.value,
      schedule.value,
      todayRecord.value.status === 'terisi'
    )
  }

  async function toggleAlarm(alarmId: string): Promise<void> {
    const target = alarms.value.find((a) => a.id === alarmId)
    if (!target) return
    const updated: AlarmRule = { ...target, enabled: !target.enabled }
    await db.alarms.put(updated).catch(() => {})
    alarms.value = alarms.value.map((a) => (a.id === alarmId ? updated : a))
    await syncAlarmsToDevice()
  }

  async function updateAlarmTime(alarmId: string, time: string): Promise<void> {
    const target = alarms.value.find((a) => a.id === alarmId)
    if (!target) return
    const tz = schedule.value.timezone
    const suffix = target.subtitle.includes('•')
      ? target.subtitle.split('•').slice(1).join('•').trim()
      : 'Pengingat aktif'
    const updated: AlarmRule = {
      ...target,
      time,
      subtitle: `Pukul ${time} ${tz} • ${suffix}`
    }
    await db.alarms.put(updated).catch(() => {})
    alarms.value = alarms.value.map((a) => (a.id === alarmId ? updated : a))
    if (target.kind === 'primary') {
      await updateSchedule({ monevCheckTime: time })
    } else {
      await syncAlarmsToDevice()
    }
  }

  async function markAlarmTriggeredToday(alarmId: string): Promise<void> {
    const target = alarms.value.find((a) => a.id === alarmId)
    if (!target) return
    const updated: AlarmRule = { ...target, lastTriggeredDate: todayKey.value }
    await db.alarms.put(updated).catch(() => {})
    alarms.value = alarms.value.map((a) => (a.id === alarmId ? updated : a))
  }

  async function updateProfile(patch: Partial<InternProfile>): Promise<void> {
    const nextName = patch.name ?? profile.value.name
    const next: InternProfile = {
      ...profile.value,
      ...patch,
      id: 'default',
      initials: computeInitials(nextName)
    }
    await db.profile.put(next).catch(() => {})
    profile.value = next
  }

  async function syncPortalStatus(): Promise<MonevStatusCheckResult> {
    if (isSyncingPortal.value) {
      return {
        outcome: 'unavailable',
        note: 'Sinkronisasi sedang berjalan...',
        checkedAt: new Date().toISOString()
      }
    }

    isSyncingPortal.value = true
    try {
      const result = await checkMonevTodayStatus(profile.value.portalAccessToken)

      const profilePatchFromApi: Partial<InternProfile> = result.userProfile
        ? {
            portalUserId: result.userProfile.portalUserId,
            name: result.userProfile.name,
            initials: result.userProfile.initials,
            role: result.userProfile.role,
            company: result.userProfile.company,
            batch: result.userProfile.batch,
            photoUrl: result.userProfile.photoUrl
          }
        : {}

      if (result.historyRecords) {
        await replaceSyncedHistory(result.historyRecords)
      }

      if (result.outcome === 'filled') {
        await updateProfile({
          ...profilePatchFromApi,
          portalSyncState: 'connected',
          sessionLastVerifiedAt: result.checkedAt,
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note,
          portalAccessToken: result.accessToken ?? profile.value.portalAccessToken
        })
        if (todayRecord.value.status !== 'terisi') {
          await upsertRecord({
            date: todayKey.value,
            status: 'terisi',
            filledAt: result.checkedAt,
            isHolidayOverride: false
          })
          await syncAlarmsToDevice()
          await addNotification({
            title: 'Auto-Sync: Monev Hari Ini Terisi',
            body: 'Terbaca otomatis dari portal MagangHub. Pengingat ulang dibatalkan.',
            type: 'info'
          })
        }
      } else if (result.outcome === 'off_day') {
        await updateProfile({
          ...profilePatchFromApi,
          portalSyncState: 'connected',
          sessionLastVerifiedAt: result.checkedAt,
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note,
          portalAccessToken: result.accessToken ?? profile.value.portalAccessToken
        })
        await upsertRecord({
          date: todayKey.value,
          status: 'libur',
          filledAt: null,
          isHolidayOverride: true
        })
        await syncAlarmsToDevice()
      } else if (result.outcome === 'unfilled') {
        await updateProfile({
          ...profilePatchFromApi,
          portalSyncState: 'connected',
          sessionLastVerifiedAt: result.checkedAt,
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note,
          portalAccessToken: result.accessToken ?? profile.value.portalAccessToken
        })
        if (todayRecord.value.status === 'terisi') {
          await upsertRecord({
            date: todayKey.value,
            status: 'belum',
            filledAt: null,
            isHolidayOverride: false
          })
          await syncAlarmsToDevice()
        }
      } else if (result.outcome === 'session_expired') {
        await updateProfile({
          portalSyncState: 'session_expired',
          sessionLastVerifiedAt: null,
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note,
          portalAccessToken: ''
        })
      } else if (result.outcome === 'disconnected') {
        await updateProfile({
          portalSyncState: 'disconnected',
          sessionLastVerifiedAt: null,
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note
        })
      } else {
        await updateProfile({
          portalSyncState: 'unavailable',
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note
        })
      }

      return result
    } finally {
      isSyncingPortal.value = false
    }
  }

  async function openPortalForLogin(
    onSyncComplete?: (res: MonevStatusCheckResult) => void
  ): Promise<void> {
    await openMonevPortalInApp({
      portalUrl: profile.value.portalUrl,
      autoCloseOnLogin: true,
      onDashboardVerify: async () => {
        const res = await syncPortalStatus()
        const ok =
          res.outcome === 'filled' ||
          res.outcome === 'unfilled' ||
          res.outcome === 'off_day'
        if (ok) onSyncComplete?.(res)
        return ok
      },
      onAfterClose: async () => {
        const res = await syncPortalStatus()
        onSyncComplete?.(res)
      }
    })
  }

  async function openPortalAndSync(
    onSyncComplete?: (res: MonevStatusCheckResult) => void
  ): Promise<void> {
    await openMonevPortalInApp({
      portalUrl: profile.value.portalUrl,
      autoCloseOnLogin: false,
      onAfterClose: async () => {
        const res = await syncPortalStatus()
        onSyncComplete?.(res)
      }
    })
  }

  async function connectWithAccessToken(
    token: string
  ): Promise<MonevStatusCheckResult> {
    await updateProfile({ portalAccessToken: token.trim() })
    return syncPortalStatus()
  }

  async function disconnectPortal(): Promise<void> {
    await clearPortalSessionCookie()
    await db.records.clear().catch(() => {})
    records.value = []
    await updateProfile({
      ...DEFAULT_PROFILE,
      telegramBotToken: profile.value.telegramBotToken,
      telegramChatId: profile.value.telegramChatId,
      lastPortalSyncNote: 'Sesi portal diputuskan. Silakan login kembali.'
    })
  }

  async function updateSchedule(patch: Partial<ScheduleConfig>): Promise<void> {
    const next: ScheduleConfig = {
      ...schedule.value,
      ...patch,
      id: 'default'
    }
    await db.schedule.put(next).catch(() => {})
    schedule.value = next

    if (patch.monevCheckTime) {
      const primary = alarms.value.find((a) => a.kind === 'primary')
      if (primary && primary.time !== patch.monevCheckTime) {
        const updated: AlarmRule = {
          ...primary,
          time: patch.monevCheckTime,
          subtitle: `Pukul ${patch.monevCheckTime} ${next.timezone} • Pengingat pengisian absen Monev harian`
        }
        await db.alarms.put(updated).catch(() => {})
        alarms.value = alarms.value.map((a) =>
          a.id === primary.id ? updated : a
        )
      }
    }

    await syncAlarmsToDevice()
  }

  async function replaceSyncedHistory(synced: MonevRecord[]): Promise<void> {
    const todayRec = records.value.find((r) => r.date === todayKey.value)
    const map = new Map<string, MonevRecord>()
    for (const item of synced) {
      map.set(item.date, item)
    }
    if (todayRec?.isHolidayOverride && !map.has(todayKey.value)) {
      map.set(todayKey.value, todayRec)
    }
    const merged = Array.from(map.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    )
    await db.records.clear().catch(() => {})
    if (merged.length > 0) {
      await db.records.bulkPut(merged).catch(() => {})
    }
    records.value = merged
  }

  async function upsertRecord(record: MonevRecord): Promise<void> {
    await db.records.put(record).catch(() => {})
    const exists = records.value.some((r) => r.date === record.date)
    if (exists) {
      records.value = records.value.map((r) =>
        r.date === record.date ? record : r
      )
    } else {
      records.value = [record, ...records.value].sort((a, b) =>
        b.date.localeCompare(a.date)
      )
    }
  }

  async function toggleHolidayToday(): Promise<void> {
    const current = todayRecord.value
    const nextHoliday = !current.isHolidayOverride
    const next: MonevRecord = {
      date: todayKey.value,
      status: nextHoliday ? 'libur' : 'belum',
      filledAt: null,
      isHolidayOverride: nextHoliday
    }
    await upsertRecord(next)
    await syncAlarmsToDevice()
  }

  async function addNotification(
    payload: Omit<NotificationLog, 'id' | 'createdAt' | 'read'>
  ): Promise<void> {
    const entry: NotificationLog = {
      ...payload,
      createdAt: new Date().toISOString(),
      read: false
    }
    const id = await db.notifications.add(entry).catch(() => Date.now())
    notifications.value = [{ ...entry, id }, ...notifications.value].slice(0, 50)
  }

  async function markAllNotificationsRead(): Promise<void> {
    await db.notifications.toCollection().modify({ read: true }).catch(() => {})
    notifications.value = notifications.value.map((n) => ({ ...n, read: true }))
  }

  async function triggerTestReminder(): Promise<{
    title: string
    body: string
    telegramResult?: { ok: boolean; error?: string }
  }> {
    const title = `Pengingat Absen Monev (${schedule.value.monevCheckTime} ${schedule.value.timezone})`
    const body =
      'Absen Monev MagangHub hari ini belum diisi. Segera buka portal Kemnaker sebelum jam pulang.'

    await triggerImmediateAlert(title, body)
    await addNotification({ title, body, type: 'alarm' })

    if (profile.value.telegramBotToken && profile.value.telegramChatId) {
      const telegramResult = await sendTelegramReminder(
        profile.value.telegramBotToken,
        profile.value.telegramChatId,
        `⏰ <b>${title}</b>\n${body}\nPortal: ${profile.value.portalUrl}`
      )
      return { title, body, telegramResult }
    }
    return { title, body }
  }

  return {
    isLoading: readonly(isLoading),
    isSyncingPortal: readonly(isSyncingPortal),
    profile: readonly(profile),
    schedule: readonly(schedule),
    alarms: readonly(alarms),
    records: readonly(records),
    notifications: readonly(notifications),
    todayKey,
    todayRecord,
    nationalHolidayToday,
    isTodayWorkday,
    activeAlarmsCount,
    unreadNotificationsCount,
    isAuthenticated,
    isSessionExpired,
    isCatchUpNeeded,
    complianceStats,
    initStore,
    toggleAlarm,
    updateAlarmTime,
    markAlarmTriggeredToday,
    updateProfile,
    syncPortalStatus,
    openPortalForLogin,
    openPortalAndSync,
    connectWithAccessToken,
    disconnectPortal,
    updateSchedule,
    toggleHolidayToday,
    addNotification,
    markAllNotificationsRead,
    triggerTestReminder
  }
}
