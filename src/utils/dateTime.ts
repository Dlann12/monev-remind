import type {
  AlarmRule,
  MonevRecord,
  ScheduleConfig,
  TimezoneLabel
} from '@/types/app'

const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const
const ID_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
] as const

/**
 * Built-in offline Indonesian National Holidays (2025-2027) so holiday sync
 * works with zero network dependency.
 */
export const INDONESIAN_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': 'Tahun Baru 2025 Masehi',
  '2025-01-27': 'Isra Mikraj Nabi Muhammad SAW',
  '2025-01-29': 'Tahun Baru Imlek 2576',
  '2025-03-29': 'Hari Suci Nyepi',
  '2025-03-31': 'Hari Raya Idul Fitri 1446 H',
  '2025-04-01': 'Hari Raya Idul Fitri 1446 H',
  '2025-04-18': 'Wafat Yesus Kristus',
  '2025-05-01': 'Hari Buruh Internasional',
  '2025-05-12': 'Hari Raya Waisak 2569 BE',
  '2025-05-29': 'Kenaikan Yesus Kristus',
  '2025-06-01': 'Hari Lahir Pancasila',
  '2025-06-06': 'Hari Raya Idul Adha 1446 H',
  '2025-06-27': 'Tahun Baru Islam 1447 H',
  '2025-08-17': 'Hari Kemerdekaan RI',
  '2025-09-05': 'Maulid Nabi Muhammad SAW',
  '2025-12-25': 'Hari Raya Natal',
  // 2026
  '2026-01-01': 'Tahun Baru 2026 Masehi',
  '2026-01-16': 'Isra Mikraj Nabi Muhammad SAW',
  '2026-02-17': 'Tahun Baru Imlek 2577',
  '2026-03-19': 'Hari Suci Nyepi',
  '2026-03-20': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-21': 'Hari Raya Idul Fitri 1447 H',
  '2026-04-03': 'Wafat Yesus Kristus',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Yesus Kristus',
  '2026-05-27': 'Hari Raya Idul Adha 1447 H',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'Hari Kemerdekaan RI',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-25': 'Hari Raya Natal',
  // 2027
  '2027-01-01': 'Tahun Baru 2027 Masehi',
  '2027-05-01': 'Hari Buruh Internasional',
  '2027-06-01': 'Hari Lahir Pancasila',
  '2027-08-17': 'Hari Kemerdekaan RI',
  '2027-12-25': 'Hari Raya Natal'
}

export function pad2(num: number): string {
  return String(num).padStart(2, '0')
}

export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  return `${y}-${m}-${d}`
}

export function formatIndonesianDate(dateOrKey: Date | string): string {
  const date =
    typeof dateOrKey === 'string'
      ? new Date(`${dateOrKey}T00:00:00`)
      : dateOrKey
  const dayName = ID_DAYS[date.getDay()]
  const dayNum = date.getDate()
  const monthName = ID_MONTHS[date.getMonth()]
  const year = date.getFullYear()
  return `${dayName}, ${dayNum} ${monthName} ${year}`
}

export function formatTimeHHMM(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export const TIMEZONE_UTC_OFFSETS: Record<TimezoneLabel, number> = {
  WIB: 420,
  WITA: 480,
  WIT: 540
}

/**
 * Shifts a Date instant so its local getters (.getHours(), .getDate(), etc.)
 * match the wall-clock time in the target Indonesian timezone (WIB/WITA/WIT).
 */
export function getShiftedDate(
  date: Date = new Date(),
  timezone: TimezoneLabel = 'WIB'
): Date {
  const targetOffsetMinutes = TIMEZONE_UTC_OFFSETS[timezone] ?? 420
  const deltaMinutes = targetOffsetMinutes + date.getTimezoneOffset()
  return new Date(date.getTime() + deltaMinutes * 60_000)
}

export function toZonedDateKey(
  date: Date = new Date(),
  timezone: TimezoneLabel = 'WIB'
): string {
  return toLocalDateKey(getShiftedDate(date, timezone))
}

/**
 * Converts a wall-clock HH:mm in sourceTimezone (WIB/WITA/WIT) to the
 * device's local wall-clock hour/minute for native OS alarm scheduling.
 */
export function convertTimeFromTzToDeviceLocal(
  timeHHMM: string,
  sourceTimezone: TimezoneLabel = 'WIB',
  referenceDate: Date = new Date()
): { hour: number; minute: number; dayDelta: number } {
  const [hStr, mStr] = timeHHMM.split(':')
  const srcHour = Number(hStr) || 0
  const srcMinute = Number(mStr) || 0
  const sourceOffsetMinutes = TIMEZONE_UTC_OFFSETS[sourceTimezone] ?? 420
  const deviceOffsetMinutes = -referenceDate.getTimezoneOffset()
  const totalMinutes =
    srcHour * 60 + srcMinute + (deviceOffsetMinutes - sourceOffsetMinutes)
  const dayDelta = Math.floor(totalMinutes / 1440)
  const wrappedMinutes = ((totalMinutes % 1440) + 1440) % 1440
  return {
    hour: Math.floor(wrappedMinutes / 60),
    minute: wrappedMinutes % 60,
    dayDelta
  }
}

/**
 * Builds the exact UTC-anchored Date instant corresponding to targetHHMM
 * on a zoned calendar date shifted by dayOffset days in timezone.
 */
export function getZonedTargetInstant(
  now: Date,
  dayOffset: number,
  targetHHMM: string,
  timezone: TimezoneLabel = 'WIB'
): { fireAt: Date; dateKey: string } {
  const tzNow = getShiftedDate(now, timezone)
  const [hStr, mStr] = targetHHMM.split(':')
  const targetHour = Number(hStr) || 0
  const targetMinute = Number(mStr) || 0
  const tzOffsetMinutes = TIMEZONE_UTC_OFFSETS[timezone] ?? 420

  const utcCursor = new Date(
    Date.UTC(
      tzNow.getFullYear(),
      tzNow.getMonth(),
      tzNow.getDate() + dayOffset,
      targetHour,
      targetMinute,
      0,
      0
    )
  )
  const dateKey = `${utcCursor.getUTCFullYear()}-${pad2(utcCursor.getUTCMonth() + 1)}-${pad2(utcCursor.getUTCDate())}`
  const fireAt = new Date(utcCursor.getTime() - tzOffsetMinutes * 60_000)
  return { fireAt, dateKey }
}

export function getCountdownSeconds(
  now: Date,
  targetHHMM: string,
  timezone?: TimezoneLabel
): number {
  const reference = timezone ? getShiftedDate(now, timezone) : now
  const [hStr, mStr] = targetHHMM.split(':')
  const target = new Date(reference)
  target.setHours(Number(hStr) || 0, Number(mStr) || 0, 0, 0)
  const diffMs = target.getTime() - reference.getTime()
  return diffMs > 0 ? Math.floor(diffMs / 1000) : 0
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hrs = pad2(Math.floor(safe / 3600))
  const mins = pad2(Math.floor((safe % 3600) / 60))
  const secs = pad2(safe % 60)
  return `${hrs}:${mins}:${secs}`
}

export function getIsoWeekday(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

export function getNationalHolidayName(dateKey: string): string | null {
  return INDONESIAN_HOLIDAYS[dateKey] ?? null
}

export function isWorkdayActive(
  date: Date,
  schedule: ScheduleConfig,
  record?: MonevRecord | null
): boolean {
  if (record?.isHolidayOverride || record?.status === 'libur') {
    return false
  }
  const tzDate = getShiftedDate(date, schedule.timezone)
  const dateKey = toLocalDateKey(tzDate)
  if (schedule.syncNationalHolidays && getNationalHolidayName(dateKey)) {
    return false
  }
  return schedule.workDays.includes(getIsoWeekday(tzDate))
}

/**
 * Catch-up check (PRD Edge Case #3):
 * Triggers if app opens after monevCheckTime (17:00) on an active workday
 * and today's Monev has not been marked filled yet.
 */
export function shouldTriggerCatchUp(
  now: Date,
  schedule: ScheduleConfig,
  record?: MonevRecord | null
): boolean {
  if (!isWorkdayActive(now, schedule, record)) return false
  if (record?.status === 'terisi') return false
  const tzNow = getShiftedDate(now, schedule.timezone)
  const nowMinutes = tzNow.getHours() * 60 + tzNow.getMinutes()
  const checkMinutes = parseTimeToMinutes(schedule.monevCheckTime)
  return nowMinutes >= checkMinutes
}

/**
 * Auto-fill check:
 * Triggers at/after 23:00 on an active workday when today's Monev is still unfilled.
 */
export function shouldTriggerAutoFill2300(
  now: Date,
  schedule: ScheduleConfig,
  record?: MonevRecord | null
): boolean {
  if (!schedule.autoFillAt2300) return false
  if (!isWorkdayActive(now, schedule, record)) return false
  if (
    record?.status === 'terisi' ||
    record?.status === 'izin' ||
    record?.status === 'libur'
  ) {
    return false
  }
  const tzNow = getShiftedDate(now, schedule.timezone)
  const todayKey = toLocalDateKey(tzNow)
  if (schedule.lastAutoFilledDate === todayKey) return false
  const nowMinutes = tzNow.getHours() * 60 + tzNow.getMinutes()
  const autoFillMinutes = parseTimeToMinutes(schedule.autoFillTime || '23:00')
  return nowMinutes >= autoFillMinutes
}

/**
 * PRD FR-04: Detect whether the MagangHub portal session is likely expired.
 */
export function isSessionLikelyExpired(
  sessionLastVerifiedAt: string | null,
  timeoutHours: number,
  now: Date = new Date()
): boolean {
  if (!sessionLastVerifiedAt) return true
  const verifiedMs = Date.parse(sessionLastVerifiedAt)
  if (Number.isNaN(verifiedMs)) return true
  const elapsedHours = (now.getTime() - verifiedMs) / (1000 * 60 * 60)
  return elapsedHours >= timeoutHours
}

/**
 * Keeps alarm title and subtitle synchronized with the user's configured time & timezone.
 */
export function syncAlarmRuleDisplay(
  alarm: AlarmRule,
  time: string,
  timezone: TimezoneLabel
): AlarmRule {
  const suffix = alarm.subtitle.includes('•')
    ? alarm.subtitle.split('•').slice(1).join('•').trim()
    : alarm.kind === 'primary'
      ? 'Pengingat pengisian absen Monev harian'
      : 'Pengingat ulang jika Monev belum diisi'

  const title =
    alarm.customTitle ||
    (alarm.kind === 'primary' ? `Alarm Utama Monev (${time})` : alarm.title)

  return {
    ...alarm,
    time,
    title,
    subtitle: `Pukul ${time} ${timezone} • ${suffix}`
  }
}
