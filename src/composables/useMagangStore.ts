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
  autoSubmitMonevFromYesterday,
  checkMonevTodayStatus,
  clearPortalSessionCookie,
  computeInitials,
  findLatestDailyLogPayload,
  mapOffDaysToWorkDays,
  normalizeDailyLogDraftForSubmit,
  openMonevPortalInApp,
  syncNativeAutoFillSchedule,
  type AutoFillMonevResult,
  type LatestDailyLogDraft,
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
  syncAlarmRuleDisplay,
  toZonedDateKey
} from '@/utils/dateTime'

const isInitialized = shallowRef(false)
const isLoading = shallowRef(true)
const isSyncingPortal = shallowRef(false)
const isAutoFilling = shallowRef(false)

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
  const todayKey = computed(() =>
    toZonedDateKey(new Date(), schedule.value.timezone)
  )

  const todayRecord = computed<MonevRecord>(() => {
    const found = records.value.find((r) => r.date === todayKey.value)
    return found ?? createDefaultTodayRecord(todayKey.value)
  })

  const latestLogDraft = computed<LatestDailyLogDraft | null>(() =>
    findLatestDailyLogPayload(records.value, todayKey.value)
  )

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
    const unfilled = activeRecords.filter((r) => r.status === 'belum').length
    const holiday = records.value.filter((r) => r.status === 'libur').length
    const total = activeRecords.length
    const percentage =
      total === 0
        ? 0
        : Math.min(100, Math.round(((filled + onLeave) / total) * 100))
    return { filled, onLeave, missed, unfilled, holiday, total, percentage }
  })

  async function initStore(): Promise<void> {
    if (isInitialized.value) return
    isLoading.value = true
    try {
      await seedInitialData()
      await reloadAll()
      await syncNativeAutoFillSchedule(
        schedule.value.autoFillAt2300,
        schedule.value.autoFillTime
      )
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
    const tz = schedule.value.timezone
    const baseAlarms = al.length > 0 ? al : [...DEFAULT_ALARMS]
    alarms.value = baseAlarms.map((alarm) =>
      syncAlarmRuleDisplay(alarm, alarm.time, tz)
    )
    records.value = rec
    notifications.value = notif
  }

  async function syncAlarmsToDevice(): Promise<void> {
    await syncNativeAlarms(
      alarms.value,
      schedule.value,
      todayRecord.value.status === 'terisi',
      todayRecord.value
    )
    await syncNativeAutoFillSchedule(
      schedule.value.autoFillAt2300,
      schedule.value.autoFillTime,
      {
        timezone: schedule.value.timezone,
        holidayOverrideDate: todayRecord.value.isHolidayOverride
          ? todayKey.value
          : null,
        workDays: schedule.value.workDays
      }
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
    if (!time) return
    const target = alarms.value.find((a) => a.id === alarmId)
    if (!target) return
    const updated: AlarmRule = {
      ...syncAlarmRuleDisplay(target, time, schedule.value.timezone),
      lastTriggeredDate: target.time !== time ? undefined : target.lastTriggeredDate
    }
    await db.alarms.put(updated).catch(() => {})
    alarms.value = alarms.value.map((a) => (a.id === alarmId ? updated : a))
    if (target.kind === 'primary') {
      await updateSchedule({ monevCheckTime: time })
    } else {
      await syncAlarmsToDevice()
    }
  }

  async function updateAlarmRule(
    alarmId: string,
    patch: Partial<AlarmRule>
  ): Promise<void> {
    const target = alarms.value.find((a) => a.id === alarmId)
    if (!target) return
    let updated: AlarmRule = { ...target, ...patch }
    if (patch.time) {
      updated = syncAlarmRuleDisplay(
        updated,
        patch.time,
        schedule.value.timezone
      )
    }
    await db.alarms.put(updated).catch(() => {})
    alarms.value = alarms.value.map((a) => (a.id === alarmId ? updated : a))
    if (patch.time && target.kind === 'primary') {
      await updateSchedule({ monevCheckTime: patch.time })
    } else {
      await syncAlarmsToDevice()
    }
  }

  async function resetAlarmRule(alarmId: string): Promise<void> {
    const defaultItem = DEFAULT_ALARMS.find((a) => a.id === alarmId)
    if (!defaultItem) return
    const target = alarms.value.find((a) => a.id === alarmId)
    if (!target) return
    const updated: AlarmRule = {
      ...defaultItem,
      time: target.time,
      enabled: target.enabled
    }
    await db.alarms.put(updated).catch(() => {})
    alarms.value = alarms.value.map((a) => (a.id === alarmId ? updated : a))
    await syncAlarmsToDevice()
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

  async function syncPortalStatus(options?: {
    includeHistory?: boolean
  }): Promise<MonevStatusCheckResult> {
    if (isSyncingPortal.value) {
      return {
        outcome: 'unavailable',
        note: 'Sinkronisasi sedang berjalan...',
        checkedAt: new Date().toISOString()
      }
    }

    isSyncingPortal.value = true
    try {
      const wasFilledBefore = todayRecord.value.status === 'terisi'
      const result = await checkMonevTodayStatus(
        profile.value.portalAccessToken,
        3,
        options
      )

      const profilePatchFromApi: Partial<InternProfile> = result.userProfile
        ? {
            portalUserId: result.userProfile.portalUserId,
            name: result.userProfile.name,
            initials: result.userProfile.initials,
            role: result.userProfile.role,
            company: result.userProfile.company,
            batch: result.userProfile.batch,
            photoUrl:
              result.userProfile.photoUrl || profile.value.photoUrl
          }
        : {}

      if (result.userProfile?.offDays && result.userProfile.offDays.length > 0) {
        const syncedWorkDays = mapOffDaysToWorkDays(result.userProfile.offDays)
        const currentSorted = [...schedule.value.workDays].sort().join(',')
        if (syncedWorkDays.join(',') !== currentSorted) {
          await updateSchedule({ workDays: syncedWorkDays })
        }
      }

      if (result.historyRecords) {
        await replaceSyncedHistory(result.historyRecords)
      }

      const nativeAutoFilledToday =
        result.lastAutoSubmittedDate === todayKey.value &&
        schedule.value.lastAutoFilledDate !== todayKey.value

      if (result.outcome === 'filled') {
        await updateProfile({
          ...profilePatchFromApi,
          portalSyncState: 'connected',
          sessionLastVerifiedAt: result.checkedAt,
          lastPortalSyncAt: result.checkedAt,
          lastPortalSyncNote: result.note,
          portalAccessToken: result.accessToken ?? profile.value.portalAccessToken
        })
        if (nativeAutoFilledToday) {
          await updateSchedule({ lastAutoFilledDate: todayKey.value })
        }
        if (todayRecord.value.status !== 'terisi') {
          await upsertRecord({
            ...todayRecord.value,
            date: todayKey.value,
            status: 'terisi',
            filledAt: result.checkedAt,
            isAutoFilled: nativeAutoFilledToday || todayRecord.value.isAutoFilled,
            isHolidayOverride: false
          })
        }
        const autoTime = schedule.value.autoFillTime || '23:00'
        if (!wasFilledBefore) {
          await syncAlarmsToDevice()
          await addNotification({
            title: nativeAutoFilledToday
              ? `Auto-Isi Monev ${autoTime} Berhasil`
              : 'Auto-Sync: Monev Hari Ini Terisi',
            body: nativeAutoFilledToday
              ? `Monev hari ini diisi otomatis mengikuti catatan kegiatan ${result.lastAutoCopiedFromDate || 'kemarin'}.`
              : 'Terbaca otomatis dari portal MagangHub. Pengingat ulang dibatalkan.',
            type: nativeAutoFilledToday ? 'auto_fill' : 'info'
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
          ...todayRecord.value,
          date: todayKey.value,
          status: 'libur',
          filledAt: null,
          holidayName: todayRecord.value.holidayName || 'Hari Libur',
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

  async function runAutoFill2300(): Promise<AutoFillMonevResult> {
    const autoTime = schedule.value.autoFillTime || '23:00'
    if (isAutoFilling.value) {
      return {
        outcome: 'unavailable',
        submittedDate: todayKey.value,
        copiedFromDate: '',
        message: `Auto-isi ${autoTime} sedang berjalan...`
      }
    }

    isAutoFilling.value = true
    try {
      const fallbackDraft = findLatestDailyLogPayload(records.value, todayKey.value)
      const res = await autoSubmitMonevFromYesterday({
        accessToken: profile.value.portalAccessToken,
        targetDate: todayKey.value,
        fallbackDraft
      })

      if (res.accessToken && res.accessToken !== profile.value.portalAccessToken) {
        await updateProfile({ portalAccessToken: res.accessToken })
      }

      if (res.outcome === 'submitted') {
        await updateSchedule({ lastAutoFilledDate: todayKey.value })
        await upsertRecord({
          date: todayKey.value,
          status: 'terisi',
          filledAt: new Date().toISOString(),
          approvalStatus: 'SUBMITTED',
          activityLog: res.activityLog ?? fallbackDraft?.activity_log ?? '',
          lessonLearned: fallbackDraft?.lesson_learned ?? '',
          obstacles: fallbackDraft?.obstacles ?? '',
          isAutoFilled: true,
          isHolidayOverride: false
        })
        await syncAlarmsToDevice()

        const title = `Auto-Isi Monev ${autoTime} Berhasil`
        const body = res.copiedFromDate
          ? `Monev hari ini otomatis terisi mengikuti kegiatan tanggal ${res.copiedFromDate}.`
          : 'Monev hari ini otomatis terisi mengikuti kegiatan sebelumnya.'

        await triggerImmediateAlert(title, body)
        await addNotification({ title, body, type: 'auto_fill' })
        await syncPortalStatus()
      } else if (res.outcome === 'already_filled') {
        await updateSchedule({ lastAutoFilledDate: todayKey.value })
        await syncPortalStatus()
      } else if (res.outcome === 'session_expired') {
        await updateProfile({
          portalSyncState: 'session_expired',
          sessionLastVerifiedAt: null,
          lastPortalSyncNote: res.message,
          portalAccessToken: ''
        })
        await addNotification({
          title: `Auto-Isi Monev ${autoTime} Gagal (Sesi Habis)`,
          body: 'Silakan login ulang ke MagangHub agar auto-isi aktif kembali.',
          type: 'session_expired'
        })
      } else if (res.outcome === 'no_previous_log') {
        await addNotification({
          title: `Auto-Isi Monev ${autoTime} Dilewati`,
          body: res.message,
          type: 'auto_fill'
        })
      }

      return res
    } finally {
      isAutoFilling.value = false
    }
  }

  async function submitCustomMonevToday(
    draft: LatestDailyLogDraft
  ): Promise<AutoFillMonevResult> {
    if (isAutoFilling.value) {
      return {
        outcome: 'unavailable',
        submittedDate: todayKey.value,
        copiedFromDate: '',
        message: 'Pengiriman Monev sedang berjalan...'
      }
    }

    isAutoFilling.value = true
    try {
      const ready = normalizeDailyLogDraftForSubmit(draft)
      const res = await autoSubmitMonevFromYesterday({
        accessToken: profile.value.portalAccessToken,
        targetDate: todayKey.value,
        customDraft: ready
      })

      if (res.accessToken && res.accessToken !== profile.value.portalAccessToken) {
        await updateProfile({ portalAccessToken: res.accessToken })
      }

      if (res.outcome === 'submitted') {
        await upsertRecord({
          date: todayKey.value,
          status: 'terisi',
          filledAt: new Date().toISOString(),
          approvalStatus: 'SUBMITTED',
          activityLog: res.activityLog ?? ready.activity_log,
          lessonLearned: ready.lesson_learned,
          obstacles: ready.obstacles,
          isAutoFilled: false,
          isHolidayOverride: false
        })
        await syncAlarmsToDevice()
        await addNotification({
          title: 'Isi Cepat Monev Berhasil',
          body: 'Laporan Monev harian berhasil dikirim ke portal MagangHub.',
          type: 'info'
        })
        await syncPortalStatus({ includeHistory: false })
      } else if (res.outcome === 'already_filled') {
        await syncPortalStatus({ includeHistory: false })
      } else if (res.outcome === 'session_expired') {
        await updateProfile({
          portalSyncState: 'session_expired',
          sessionLastVerifiedAt: null,
          lastPortalSyncNote: res.message,
          portalAccessToken: ''
        })
      }

      return res
    } finally {
      isAutoFilling.value = false
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

    if (patch.monevCheckTime || patch.timezone) {
      const updatedAlarms = alarms.value.map((alarm) => {
        if (alarm.kind === 'primary' && patch.monevCheckTime) {
          return {
            ...syncAlarmRuleDisplay(alarm, patch.monevCheckTime, next.timezone),
            lastTriggeredDate:
              alarm.time !== patch.monevCheckTime
                ? undefined
                : alarm.lastTriggeredDate
          }
        }
        if (patch.timezone) {
          return syncAlarmRuleDisplay(alarm, alarm.time, next.timezone)
        }
        return alarm
      })
      await db.alarms.bulkPut(updatedAlarms).catch(() => {})
      alarms.value = updatedAlarms
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
    } else if (todayRec?.isAutoFilled && map.has(todayKey.value)) {
      const existing = map.get(todayKey.value)!
      map.set(todayKey.value, { ...existing, isAutoFilled: true })
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
      holidayName: nextHoliday ? 'Libur Manual' : undefined,
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
    const primary = alarms.value.find((a) => a.kind === 'primary')
    const title =
      primary?.customTitle ||
      `Pengingat Absen Monev (${schedule.value.monevCheckTime} ${schedule.value.timezone})`
    const body =
      primary?.customMessage ||
      'Jangan lupa isi monev MagangHub hari ini! Buka portal Kemnaker sekarang.'

    await triggerImmediateAlert(
      title,
      body,
      primary?.soundType || 'voice',
      primary?.vibrate !== false
    )
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
    isAutoFilling: readonly(isAutoFilling),
    profile: readonly(profile),
    schedule: readonly(schedule),
    alarms: readonly(alarms),
    records: readonly(records),
    notifications: readonly(notifications),
    todayKey,
    todayRecord,
    latestLogDraft,
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
    updateAlarmRule,
    resetAlarmRule,
    markAlarmTriggeredToday,
    updateProfile,
    syncPortalStatus,
    runAutoFill2300,
    submitCustomMonevToday,
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
