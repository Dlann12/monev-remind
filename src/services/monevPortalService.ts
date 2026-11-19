import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  InAppBrowser,
  ToolbarPosition,
  iOSAnimation,
  iOSViewStyle
} from '@capacitor/inappbrowser'
import type { MonevDayStatus, MonevRecord, TimezoneLabel } from '@/types/app'
import {
  INDONESIAN_HOLIDAYS,
  convertTimeFromTzToDeviceLocal,
  getIsoWeekday,
  toLocalDateKey
} from '@/utils/dateTime'

export interface MonevUserApiPayload {
  id?: string
  name?: string
  user_type?: string
  company?: string
  internship_company?: string
  internship_position?: string
  position?: string
  photo_url?: string
  photo_data_url?: string
  avatar_url?: string
  avatar?: string
  photo?: string
  internship_start_date?: string
  internship_end_date?: string
  internship_location_province_code?: string
  internship_location_regency_code?: string
  off_days?: string[]
  data?: MonevUserApiPayload
}

export interface MonevAttendanceApiItem {
  id?: string
  date?: string
  status?: 'PRESENT' | 'ON_LEAVE' | 'ABSENT' | 'DAYOFF' | string
  approval_status?: 'APPROVED' | 'SUBMITTED' | 'REJECTED' | string
  leave_reason?: string
  created_at?: string
  updated_at?: string
}

export interface MonevDailyLogApiItem {
  id?: string
  date?: string
  activity_log?: string
  lesson_learned?: string
  obstacles?: string
  state?: string
  reviewer_notes?: string
}

export interface MonevHolidayApiItem {
  id?: string
  date?: string
  name?: string
  scope?: 'NATIONAL' | 'PROVINCE' | 'REGENCY' | string
  province_code?: string
  regency_code?: string
  type?: string
}

export interface SyncedMonevProfile {
  portalUserId: string
  name: string
  initials: string
  role: string
  company: string
  batch: string
  photoUrl: string
  startDate: string
  endDate: string
  provinceCode: string
  regencyCode: string
  offDays: string[]
}

export interface LatestDailyLogDraft {
  sourceDate: string
  activity_log: string
  lesson_learned: string
  obstacles: string
}

export const MONEV_MIN_CHARS = 100

const MONEV_DEFAULT_TEXT: Record<'activity' | 'lesson' | 'obstacles', string> = {
  activity:
    'Melaksanakan rangkaian kegiatan operasional harian magang sesuai arahan mentor serta memastikan seluruh target tugas selesai tepat waktu.',
  lesson:
    'Memperoleh pemahaman praktis mengenai alur kerja tim, koordinasi operasional, komunikasi profesional, serta standar penyelesaian tugas harian di lingkungan magang.',
  obstacles:
    'Tidak terdapat kendala signifikan selama pelaksanaan kegiatan hari ini; seluruh koordinasi pekerjaan dan penyelesaian tugas bersama tim berjalan lancar sesuai rencana.'
}

const MONEV_PAD_SUFFIX: Record<'activity' | 'lesson' | 'obstacles', string> = {
  activity:
    'Kegiatan dilaksanakan secara konsisten bersama tim sesuai arahan mentor lapangan dan target evaluasi harian program magang.',
  lesson:
    'Pembelajaran ini meningkatkan pemahaman terhadap alur kerja tim, standar kualitas operasional, serta ketepatan koordinasi harian di tempat magang.',
  obstacles:
    'Kendala yang ditemui dapat diatasi dengan baik melalui koordinasi bersama mentor dan rekan tim sehingga seluruh tugas harian tetap berjalan lancar.'
}

export function ensureMinMonevLength(
  text: string,
  kind: 'activity' | 'lesson' | 'obstacles'
): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim()
  if (cleaned.length >= MONEV_MIN_CHARS) return cleaned
  if (!cleaned) return MONEV_DEFAULT_TEXT[kind]
  const sep = /[.!?]$/.test(cleaned) ? ' ' : '. '
  return `${cleaned}${sep}${MONEV_PAD_SUFFIX[kind]}`
}

export function normalizeDailyLogDraftForSubmit(
  draft?: Partial<LatestDailyLogDraft> | null
): LatestDailyLogDraft {
  return {
    sourceDate: draft?.sourceDate || '',
    activity_log: ensureMinMonevLength(draft?.activity_log ?? '', 'activity'),
    lesson_learned: ensureMinMonevLength(draft?.lesson_learned ?? '', 'lesson'),
    obstacles: ensureMinMonevLength(draft?.obstacles ?? '', 'obstacles')
  }
}

export interface DeviceAlarmPermissions {
  canScheduleExactAlarms: boolean
  ignoringBatteryOptimizations: boolean
}

interface MonevSyncPlugin {
  checkTodayStatus(options?: {
    accessToken?: string
    includeHistory?: boolean
  }): Promise<{
    state: 'ok' | 'session_expired' | 'unavailable'
    hasAttendance?: boolean
    isScheduledOffDay?: boolean
    isHoliday?: boolean
    accessToken?: string
    user?: MonevUserApiPayload
    attendances?: MonevAttendanceApiItem[]
    dailyLogs?: MonevDailyLogApiItem[]
    holidays?: MonevHolidayApiItem[]
    lastAutoSubmittedDate?: string
    lastAutoCopiedFromDate?: string
    httpStatus?: number
    reason?: string
    error?: string
  }>
  submitAutoMonev(options: {
    accessToken?: string
    targetDate?: string
    activityLog?: string
    lessonLearned?: string
    obstacles?: string
    preferFallback?: boolean
  }): Promise<{
    state:
      | 'submitted'
      | 'already_filled'
      | 'off_day'
      | 'no_previous_log'
      | 'session_expired'
      | 'unavailable'
    reason?: string
    httpStatus?: number
    message?: string
    accessToken?: string
    submittedDate?: string
    copiedFromDate?: string
    activityLog?: string
  }>
  scheduleAutoFillAlarm(options: {
    enabled: boolean
    hour: number
    minute: number
    holidayOverrideDate?: string
    workDaysCsv?: string
  }): Promise<void>
  getDeviceAlarmStatus(): Promise<DeviceAlarmPermissions>
  openDeviceAlarmSettings(options?: {
    target?: 'exact_alarm' | 'battery'
  }): Promise<void>
  clearPortalSession(): Promise<void>
}

const MonevSync = registerPlugin<MonevSyncPlugin>('MonevSync')

export interface MonevStatusCheckResult {
  outcome:
    | 'filled'
    | 'unfilled'
    | 'off_day'
    | 'session_expired'
    | 'disconnected'
    | 'unavailable'
  accessToken?: string
  userProfile?: SyncedMonevProfile
  historyRecords?: MonevRecord[]
  lastAutoSubmittedDate?: string
  lastAutoCopiedFromDate?: string
  note: string
  checkedAt: string
}

export interface AutoFillMonevResult {
  outcome:
    | 'submitted'
    | 'already_filled'
    | 'off_day'
    | 'no_previous_log'
    | 'session_expired'
    | 'unavailable'
  submittedDate: string
  copiedFromDate: string
  activityLog?: string
  accessToken?: string
  message: string
}

export interface MonevHomeApiPayload {
  has_attendance?: boolean
  is_scheduled_off_day?: boolean
  is_holiday?: boolean
  data?: {
    has_attendance?: boolean
    is_scheduled_off_day?: boolean
    is_holiday?: boolean
  }
}

const OFF_DAY_TO_ISO: Record<string, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7
}

export function mapOffDaysToWorkDays(offDays?: ReadonlyArray<string>): number[] {
  if (!offDays || offDays.length === 0) {
    return [1, 2, 3, 4, 5]
  }
  const offSet = new Set(
    offDays
      .map((d) => OFF_DAY_TO_ISO[String(d).trim().toUpperCase()])
      .filter((n): n is number => Number.isFinite(n))
  )
  const active = [1, 2, 3, 4, 5, 6, 7].filter((day) => !offSet.has(day))
  return active.length > 0 ? active : [1, 2, 3, 4, 5]
}

export function isHolidayApplicableToUser(
  holiday: MonevHolidayApiItem,
  provinceCode?: string,
  regencyCode?: string
): boolean {
  const scope = String(holiday.scope || '').toUpperCase()
  if (!scope || scope === 'NATIONAL') return true
  if (scope === 'PROVINCE') {
    return Boolean(provinceCode && holiday.province_code === provinceCode)
  }
  if (scope === 'REGENCY') {
    return Boolean(regencyCode && holiday.regency_code === regencyCode)
  }
  return false
}

export function parseMonevHomePayload(
  raw: MonevHomeApiPayload | null | undefined
): 'filled' | 'unfilled' | 'off_day' {
  const payload = raw?.data ?? raw
  if (payload?.is_scheduled_off_day || payload?.is_holiday) {
    return 'off_day'
  }
  return payload?.has_attendance ? 'filled' : 'unfilled'
}

function formatShortPeriod(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return 'Program MagangHub Kemnaker RI'
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Program MagangHub Kemnaker RI'
  }
  const fmt = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
  return `Periode ${fmt.format(start)} – ${fmt.format(end)}`
}

export function computeInitials(name: string): string {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return initials || 'MH'
}

export function normalizeProfilePhotoUrl(rawUrl?: string | null): string {
  const cleaned = (rawUrl || '').trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('data:image/')) return cleaned
  if (cleaned.startsWith('//')) return `https:${cleaned}`
  if (/^http:\/\/[^/]*kemnaker\.go\.id/i.test(cleaned)) {
    return cleaned.replace(/^http:\/\//i, 'https://')
  }
  if (/^https?:\/\//i.test(cleaned)) return cleaned
  if (cleaned.startsWith('/')) {
    return `https://monev.maganghub.kemnaker.go.id${cleaned}`
  }
  return `https://monev.maganghub.kemnaker.go.id/${cleaned}`
}

export function parseMonevUserPayload(
  raw: MonevUserApiPayload | null | undefined
): SyncedMonevProfile | undefined {
  const u = raw?.data ?? raw
  const name = u?.name?.trim()
  if (!name) return undefined

  const company =
    u?.internship_company?.trim() ||
    u?.company?.trim() ||
    'Mitra MagangHub Kemnaker'
  const role =
    u?.internship_position?.trim() ||
    u?.position?.trim() ||
    (u?.user_type?.toLowerCase() === 'peserta'
      ? 'Peserta MagangHub'
      : u?.user_type?.trim() || 'Peserta MagangHub')

  const cachedDataUrl = u?.photo_data_url?.trim() || ''
  const resolvedPhotoUrl = cachedDataUrl.startsWith('data:image/')
    ? cachedDataUrl
    : normalizeProfilePhotoUrl(
        u?.photo_url || u?.avatar_url || u?.avatar || u?.photo || ''
      )

  return {
    portalUserId: u?.id ? String(u.id) : '',
    name,
    initials: computeInitials(name),
    role,
    company,
    batch: formatShortPeriod(u?.internship_start_date, u?.internship_end_date),
    photoUrl: resolvedPhotoUrl,
    startDate: u?.internship_start_date?.slice(0, 10) || '',
    endDate: u?.internship_end_date?.slice(0, 10) || '',
    provinceCode: u?.internship_location_province_code?.trim() || '',
    regencyCode: u?.internship_location_regency_code?.trim() || '',
    offDays: Array.isArray(u?.off_days)
      ? u.off_days.map((d) => String(d).trim().toUpperCase()).filter(Boolean)
      : []
  }
}

export function mapAttendanceStatus(rawStatus?: string): MonevDayStatus {
  switch (rawStatus) {
    case 'PRESENT':
      return 'terisi'
    case 'ON_LEAVE':
      return 'izin'
    case 'DAYOFF':
      return 'libur'
    case 'ABSENT':
      return 'terlewat'
    default:
      return 'belum'
  }
}

export function parseMonevAttendancesPayload(
  raw:
    | MonevAttendanceApiItem[]
    | { data?: MonevAttendanceApiItem[] }
    | null
    | undefined
): MonevRecord[] {
  const list = Array.isArray(raw) ? raw : raw?.data
  if (!Array.isArray(list)) return []

  const byDate = new Map<string, MonevRecord>()
  for (const item of list) {
    const dateKey = item.date?.slice(0, 10)
    if (!dateKey) continue
    const status = mapAttendanceStatus(item.status)
    byDate.set(dateKey, {
      date: dateKey,
      status,
      filledAt: item.created_at ?? item.updated_at ?? null,
      approvalStatus: item.approval_status ?? '',
      leaveReason: item.leave_reason ?? '',
      isHolidayOverride: status === 'libur'
    })
  }

  return Array.from(byDate.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  )
}

export interface BuildHistoryOptions {
  startDate?: string
  endDate?: string
  todayKey?: string
  attendances?: ReadonlyArray<MonevAttendanceApiItem>
  dailyLogs?: ReadonlyArray<MonevDailyLogApiItem>
  holidays?: ReadonlyArray<MonevHolidayApiItem>
  offDays?: ReadonlyArray<string>
  workDays?: ReadonlyArray<number>
  provinceCode?: string
  regencyCode?: string
}

/**
 * Mirrors Monev MagangHub calendar history logic: fills every calendar day from
 * internship_start_date up to min(today, internship_end_date) with PRESENT, ON_LEAVE,
 * ABSENT, DAYOFF/Holiday, or Belum Diisi so no attendance state is ever omitted.
 */
export function buildCompleteMonevHistory(
  options: BuildHistoryOptions
): MonevRecord[] {
  const today = options.todayKey || toLocalDateKey(new Date())
  const attendances = options.attendances ?? []
  const dailyLogs = options.dailyLogs ?? []

  const attendanceMap = new Map<string, MonevAttendanceApiItem>()
  for (const item of attendances) {
    const dk = item.date?.slice(0, 10)
    if (dk) attendanceMap.set(dk, item)
  }

  const logMap = new Map<string, MonevDailyLogApiItem>()
  for (const log of dailyLogs) {
    const dk = log.date?.slice(0, 10)
    if (dk) logMap.set(dk, log)
  }

  const holidayMap = new Map<string, string>()
  if (Array.isArray(options.holidays)) {
    for (const h of options.holidays) {
      const dk = h.date?.slice(0, 10)
      if (!dk) continue
      if (isHolidayApplicableToUser(h, options.provinceCode, options.regencyCode)) {
        holidayMap.set(dk, h.name?.trim() || 'Hari Libur Nasional')
      }
    }
  } else {
    for (const [dk, name] of Object.entries(INDONESIAN_HOLIDAYS)) {
      holidayMap.set(dk, name)
    }
  }

  const activeWorkDays =
    options.offDays && options.offDays.length > 0
      ? mapOffDaysToWorkDays(options.offDays)
      : options.workDays && options.workDays.length > 0
        ? [...options.workDays]
        : [1, 2, 3, 4, 5]
  const workDaySet = new Set(activeWorkDays)

  let startDate = options.startDate?.slice(0, 10) || ''
  if (!startDate && attendanceMap.size > 0) {
    startDate = Array.from(attendanceMap.keys()).sort()[0] || ''
  }

  const rawEnd = options.endDate?.slice(0, 10) || ''
  const endDate = rawEnd && rawEnd < today ? rawEnd : today

  const byDate = new Map<string, MonevRecord>()

  const buildFromAttendance = (
    dk: string,
    att: MonevAttendanceApiItem,
    log?: MonevDailyLogApiItem
  ): MonevRecord => {
    const status = mapAttendanceStatus(att.status)
    const holidayName = holidayMap.get(dk)
    return {
      date: dk,
      status,
      filledAt: att.created_at ?? att.updated_at ?? null,
      approvalStatus: att.approval_status ?? '',
      dailyLogState: log?.state ?? '',
      activityLog: log?.activity_log ?? '',
      lessonLearned: log?.lesson_learned ?? '',
      obstacles: log?.obstacles ?? '',
      leaveReason: att.leave_reason ?? '',
      holidayName: status === 'libur' ? holidayName || 'Hari Libur' : undefined,
      isHolidayOverride: status === 'libur'
    }
  }

  if (startDate && endDate && startDate <= endDate) {
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ey, em, ed] = endDate.split('-').map(Number)
    const cursor = new Date(sy || 2026, (sm || 1) - 1, sd || 1)
    const endDt = new Date(ey || 2026, (em || 1) - 1, ed || 1)

    let guard = 0
    while (cursor.getTime() <= endDt.getTime() && guard < 400) {
      const dk = toLocalDateKey(cursor)
      const att = attendanceMap.get(dk)
      const log = logMap.get(dk)
      const holidayName = holidayMap.get(dk)

      if (att) {
        byDate.set(dk, buildFromAttendance(dk, att, log))
      } else if (log && (log.activity_log || '').trim()) {
        byDate.set(dk, {
          date: dk,
          status: 'terisi',
          filledAt: null,
          approvalStatus: '',
          dailyLogState: log.state ?? '',
          activityLog: log.activity_log ?? '',
          lessonLearned: log.lesson_learned ?? '',
          obstacles: log.obstacles ?? '',
          isHolidayOverride: false
        })
      } else if (holidayName || !workDaySet.has(getIsoWeekday(cursor))) {
        byDate.set(dk, {
          date: dk,
          status: 'libur',
          filledAt: null,
          holidayName: holidayName || 'Akhir Pekan / Hari Libur',
          isHolidayOverride: true
        })
      } else {
        byDate.set(dk, {
          date: dk,
          status: 'belum',
          filledAt: null,
          isHolidayOverride: false
        })
      }

      cursor.setDate(cursor.getDate() + 1)
      guard++
    }
  }

  // Ensure any API records outside the period window are still preserved
  for (const [dk, att] of attendanceMap.entries()) {
    if (!byDate.has(dk)) {
      byDate.set(dk, buildFromAttendance(dk, att, logMap.get(dk)))
    }
  }

  return Array.from(byDate.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  )
}

export function findLatestDailyLogPayload(
  sources: ReadonlyArray<MonevRecord | MonevDailyLogApiItem>,
  beforeDate: string
): LatestDailyLogDraft | null {
  let best: LatestDailyLogDraft | null = null

  for (const item of sources) {
    const dateKey = item.date?.slice(0, 10)
    if (!dateKey || dateKey >= beforeDate) continue

    const isRecord = 'status' in item
    const activity = isRecord ? item.activityLog : item.activity_log
    const cleanActivity = activity?.trim() || ''
    if (!cleanActivity) continue

    const lesson = isRecord ? item.lessonLearned : item.lesson_learned
    const obstacles = item.obstacles

    if (!best || dateKey > best.sourceDate) {
      best = {
        sourceDate: dateKey,
        activity_log: cleanActivity,
        lesson_learned: lesson?.trim() || '',
        obstacles: obstacles?.trim() || ''
      }
    }
  }

  return best
}

function describeOutcome(
  outcome: Exclude<
    MonevStatusCheckResult['outcome'],
    'disconnected' | 'session_expired' | 'unavailable'
  >
): string {
  if (outcome === 'filled') {
    return 'Terdeteksi otomatis: absen Monev hari ini sudah terisi di portal Kemnaker.'
  }
  if (outcome === 'off_day') {
    return 'Portal Kemnaker menandai hari ini sebagai hari libur / tidak ada jadwal.'
  }
  return 'Terdeteksi otomatis: absen Monev hari ini BELUM diisi di portal Kemnaker.'
}

function getMonthStartsBetween(startDate: string, endDate: string): string[] {
  const result: string[] = []
  const [sy, sm] = startDate.slice(0, 7).split('-').map(Number)
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number)
  if (!sy || !sm || !ey || !em) return result

  const cur = new Date(sy, sm - 1, 1)
  const end = new Date(ey, em - 1, 1)
  let guard = 0
  while (cur.getTime() <= end.getTime() && guard < 24) {
    result.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`)
    cur.setMonth(cur.getMonth() + 1)
    guard++
  }
  return result
}

async function fetchWebPaginatedAttendances(
  userId: string,
  startDate: string,
  endDate: string,
  headers: Record<string, string>
): Promise<MonevAttendanceApiItem[]> {
  const combined: MonevAttendanceApiItem[] = []
  const pageSize = 100
  for (let page = 1; page <= 15; page++) {
    const params = new URLSearchParams({
      participant_id: userId,
      start_date: startDate,
      end_date: endDate,
      page: String(page),
      limit: String(pageSize)
    })
    const res = await fetch(`/monev-api/attendances?${params.toString()}`, {
      method: 'GET',
      headers
    })
    if (!res.ok) break
    const json = (await res.json()) as {
      data?: MonevAttendanceApiItem[]
      total?: number
    }
    const items = Array.isArray(json.data) ? json.data : []
    combined.push(...items)
    if (
      items.length < pageSize ||
      (typeof json.total === 'number' && combined.length >= json.total)
    ) {
      break
    }
  }
  return combined
}

async function fetchWebPaginatedHolidays(
  headers: Record<string, string>
): Promise<MonevHolidayApiItem[] | undefined> {
  const combined: MonevHolidayApiItem[] = []
  const pageSize = 100
  let fetchedAnyPage = false

  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`/monev-api/holidays?page=${page}&limit=${pageSize}`, {
      method: 'GET',
      headers
    })
    if (!res.ok) break
    fetchedAnyPage = true
    const json = (await res.json()) as {
      data?: MonevHolidayApiItem[]
      total?: number
    }
    const items = Array.isArray(json.data) ? json.data : []
    combined.push(...items)
    if (
      items.length < pageSize ||
      (typeof json.total === 'number' && combined.length >= json.total)
    ) {
      break
    }
  }
  return fetchedAnyPage ? combined : undefined
}

async function fetchWebDailyLogsInRange(
  userId: string,
  startDate: string,
  endDate: string,
  headers: Record<string, string>
): Promise<MonevDailyLogApiItem[]> {
  const months = getMonthStartsBetween(startDate, endDate)
  const pages = await Promise.all(
    months.map(async (monthFirst) => {
      try {
        const params = new URLSearchParams({
          participant_id: userId,
          date: monthFirst,
          limit: '100'
        })
        const res = await fetch(`/monev-api/daily-logs?${params.toString()}`, {
          method: 'GET',
          headers
        })
        if (!res.ok) return [] as MonevDailyLogApiItem[]
        const json = (await res.json()) as { data?: MonevDailyLogApiItem[] }
        return Array.isArray(json.data) ? json.data : []
      } catch {
        return [] as MonevDailyLogApiItem[]
      }
    })
  )
  return pages.flat()
}

async function runSingleCheck(
  accessToken?: string,
  includeHistory = true
): Promise<MonevStatusCheckResult> {
  const checkedAt = new Date().toISOString()
  const todayStr = toLocalDateKey(new Date())

  if (Capacitor.isNativePlatform()) {
    const res = await MonevSync.checkTodayStatus({
      accessToken: accessToken?.trim() || '',
      includeHistory
    })

    if (res.state === 'ok') {
      const outcome =
        res.isScheduledOffDay || res.isHoliday
          ? 'off_day'
          : res.hasAttendance
            ? 'filled'
            : 'unfilled'
      const userProfile = parseMonevUserPayload(res.user)
      const historyRecords = includeHistory
        ? userProfile
          ? buildCompleteMonevHistory({
              startDate: userProfile.startDate,
              endDate: userProfile.endDate,
              todayKey: todayStr,
              attendances: res.attendances ?? [],
              dailyLogs: res.dailyLogs ?? [],
              holidays:
                res.holidays && res.holidays.length > 0 ? res.holidays : undefined,
              offDays: userProfile.offDays,
              provinceCode: userProfile.provinceCode,
              regencyCode: userProfile.regencyCode
            })
          : res.attendances
            ? parseMonevAttendancesPayload(res.attendances)
            : undefined
        : undefined

      return {
        outcome,
        accessToken: res.accessToken,
        userProfile,
        historyRecords,
        lastAutoSubmittedDate: res.lastAutoSubmittedDate,
        lastAutoCopiedFromDate: res.lastAutoCopiedFromDate,
        note: describeOutcome(outcome),
        checkedAt
      }
    }

    if (res.state === 'session_expired') {
      return {
        outcome: res.reason === 'no_cookie' ? 'disconnected' : 'session_expired',
        note:
          res.reason === 'no_cookie'
            ? 'Belum terhubung. Login lewat portal di aplikasi untuk menyinkronkan profil & status.'
            : 'Sesi MagangHub habis. Login ulang untuk cek status absen hari ini.',
        checkedAt
      }
    }

    return {
      outcome: 'unavailable',
      note: 'Server Kemnaker sedang lambat/tidak dapat diakses. Coba lagi sebentar.',
      checkedAt
    }
  }

  // Web preview mode: uses local Vite proxy when user provides an active session token
  const cleanToken = accessToken?.replace(/^Bearer\s+/i, '').trim()
  if (!cleanToken) {
    return {
      outcome: 'disconnected',
      note: 'Belum terhubung ke akun Monev MagangHub.',
      checkedAt
    }
  }

  try {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${cleanToken}`
    }
    const [homeRes, userRes] = await Promise.all([
      fetch('/monev-api/users/me/home', { method: 'GET', headers }),
      includeHistory
        ? fetch('/monev-api/users/me', { method: 'GET', headers })
        : Promise.resolve(null)
    ])

    if (
      homeRes.status === 401 ||
      homeRes.status === 403 ||
      userRes?.status === 401 ||
      userRes?.status === 403
    ) {
      return {
        outcome: 'session_expired',
        note: 'Sesi MagangHub habis. Login & cek apakah Monev hari ini sudah diisi.',
        checkedAt
      }
    }

    if (!homeRes.ok) {
      return {
        outcome: 'unavailable',
        note: `Portal Kemnaker merespons HTTP ${homeRes.status}.`,
        checkedAt
      }
    }

    const homeJson = (await homeRes.json()) as MonevHomeApiPayload
    const userJson = userRes?.ok
      ? ((await userRes.json()) as MonevUserApiPayload)
      : undefined
    const userProfile = parseMonevUserPayload(userJson)
    const outcome = parseMonevHomePayload(homeJson)

    let historyRecords: MonevRecord[] | undefined
    if (includeHistory && userProfile?.portalUserId && userProfile.startDate) {
      const endDate =
        userProfile.endDate && userProfile.endDate < todayStr
          ? userProfile.endDate
          : todayStr
      if (endDate >= userProfile.startDate) {
        const [attendances, dailyLogs, holidays] = await Promise.all([
          fetchWebPaginatedAttendances(
            userProfile.portalUserId,
            userProfile.startDate,
            endDate,
            headers
          ),
          fetchWebDailyLogsInRange(
            userProfile.portalUserId,
            userProfile.startDate,
            endDate,
            headers
          ),
          fetchWebPaginatedHolidays(headers)
        ])

        historyRecords = buildCompleteMonevHistory({
          startDate: userProfile.startDate,
          endDate: userProfile.endDate,
          todayKey: todayStr,
          attendances,
          dailyLogs,
          holidays,
          offDays: userProfile.offDays,
          provinceCode: userProfile.provinceCode,
          regencyCode: userProfile.regencyCode
        })
      }
    }

    return {
      outcome,
      accessToken: cleanToken,
      userProfile,
      historyRecords,
      note: describeOutcome(outcome),
      checkedAt
    }
  } catch {
    return {
      outcome: 'unavailable',
      note: 'Gagal menghubungi /monev-api (periksa koneksi internet atau jalankan via vite dev).',
      checkedAt
    }
  }
}

/**
 * Checks today's Monev status, user profile, and complete attendance history with retry.
 */
export async function checkMonevTodayStatus(
  accessToken?: string,
  maxAttempts = 3,
  options?: { includeHistory?: boolean }
): Promise<MonevStatusCheckResult> {
  const includeHistory = options?.includeHistory ?? true
  let lastResult = await runSingleCheck(accessToken, includeHistory)
  let attempt = 1

  while (lastResult.outcome === 'unavailable' && attempt < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1200 * attempt))
    lastResult = await runSingleCheck(accessToken, includeHistory)
    attempt++
  }

  return lastResult
}

/**
 * Auto-fills today's Monev attendance + daily log using either a custom quick-fill draft
 * or the latest filled activity prior to today (yesterday or most recent workday).
 */
export async function autoSubmitMonevFromYesterday(options: {
  accessToken?: string
  targetDate?: string
  fallbackDraft?: LatestDailyLogDraft | null
  customDraft?: LatestDailyLogDraft | null
}): Promise<AutoFillMonevResult> {
  const targetDate = options.targetDate || toLocalDateKey(new Date())
  const normalizedCustom = options.customDraft
    ? normalizeDailyLogDraftForSubmit(options.customDraft)
    : null
  const normalizedFallback = options.fallbackDraft
    ? normalizeDailyLogDraftForSubmit(options.fallbackDraft)
    : null

  if (Capacitor.isNativePlatform()) {
    const payloadDraft = normalizedCustom ?? normalizedFallback
    const res = await MonevSync.submitAutoMonev({
      accessToken: options.accessToken?.trim() || '',
      targetDate,
      activityLog: payloadDraft?.activity_log || '',
      lessonLearned: payloadDraft?.lesson_learned || '',
      obstacles: payloadDraft?.obstacles || '',
      preferFallback: Boolean(normalizedCustom)
    })
    return {
      outcome: res.state,
      submittedDate: res.submittedDate || targetDate,
      copiedFromDate:
        res.copiedFromDate ||
        normalizedCustom?.sourceDate ||
        options.fallbackDraft?.sourceDate ||
        '',
      activityLog: res.activityLog,
      accessToken: res.accessToken,
      message: res.message || 'Proses auto-isi Monev selesai.'
    }
  }

  const cleanToken = options.accessToken?.replace(/^Bearer\s+/i, '').trim()
  if (!cleanToken) {
    return {
      outcome: 'session_expired',
      submittedDate: targetDate,
      copiedFromDate: '',
      message: 'Sesi MagangHub tidak aktif untuk auto-isi.'
    }
  }

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${cleanToken}`
  }

  try {
    const homeRes = await fetch('/monev-api/users/me/home', { method: 'GET', headers })
    if (homeRes.status === 401 || homeRes.status === 403) {
      return {
        outcome: 'session_expired',
        submittedDate: targetDate,
        copiedFromDate: '',
        message: 'Sesi MagangHub habis saat mengecek auto-isi 23:00.'
      }
    }
    if (homeRes.ok) {
      const homeJson = (await homeRes.json()) as MonevHomeApiPayload
      const parsed = parseMonevHomePayload(homeJson)
      if (parsed === 'off_day') {
        return {
          outcome: 'off_day',
          submittedDate: targetDate,
          copiedFromDate: '',
          message: 'Hari ini hari libur / tidak ada jadwal.'
        }
      }
      if (parsed === 'filled') {
        return {
          outcome: 'already_filled',
          submittedDate: targetDate,
          copiedFromDate: '',
          message: 'Monev hari ini sudah terisi sebelumnya.'
        }
      }
    }

    let draft: LatestDailyLogDraft | null = normalizedCustom
    if (!draft) {
      const userRes = await fetch('/monev-api/users/me', { method: 'GET', headers })
      if (userRes.ok) {
        const userJson = (await userRes.json()) as MonevUserApiPayload
        const user = parseMonevUserPayload(userJson)
        if (user?.portalUserId) {
          const dt = new Date(`${targetDate}T12:00:00`)
          dt.setDate(1)
          const curMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`
          dt.setMonth(dt.getMonth() - 1)
          const prevMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`
          const recentLogs = await fetchWebDailyLogsInRange(
            user.portalUserId,
            prevMonth,
            curMonth,
            headers
          )
          draft = findLatestDailyLogPayload(recentLogs, targetDate)
        }
      }
    }

    if (!draft && normalizedFallback) {
      draft = normalizedFallback
    }

    if (!draft) {
      return {
        outcome: 'no_previous_log',
        submittedDate: targetDate,
        copiedFromDate: '',
        message: 'Belum ada catatan kegiatan kemarin untuk disalin otomatis.'
      }
    }

    const readyDraft = normalizeDailyLogDraftForSubmit(draft)

    const postRes = await fetch('/monev-api/attendances/with-daily-log', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        date: targetDate,
        status: 'PRESENT',
        activity_log: readyDraft.activity_log,
        lesson_learned: readyDraft.lesson_learned,
        obstacles: readyDraft.obstacles
      })
    })

    if (postRes.status === 401 || postRes.status === 403) {
      return {
        outcome: 'session_expired',
        submittedDate: targetDate,
        copiedFromDate: readyDraft.sourceDate,
        message: 'Sesi MagangHub habis saat mengirim auto-isi Monev.'
      }
    }

    if (!postRes.ok) {
      return {
        outcome: 'unavailable',
        submittedDate: targetDate,
        copiedFromDate: readyDraft.sourceDate,
        message: `Gagal kirim auto-isi (HTTP ${postRes.status}).`
      }
    }

    return {
      outcome: 'submitted',
      submittedDate: targetDate,
      copiedFromDate: readyDraft.sourceDate,
      activityLog: readyDraft.activity_log,
      accessToken: cleanToken,
      message: normalizedCustom
        ? 'Monev hari ini berhasil dikirim ke portal MagangHub.'
        : `Auto-isi Monev 23:00 berhasil menyalin kegiatan tanggal ${readyDraft.sourceDate}.`
    }
  } catch {
    return {
      outcome: 'unavailable',
      submittedDate: targetDate,
      copiedFromDate: '',
      message: 'Gagal menghubungi server Kemnaker saat auto-isi Monev.'
    }
  }
}

export async function syncNativeAutoFillSchedule(
  enabled: boolean,
  timeHHMM = '23:00',
  options?: {
    timezone?: TimezoneLabel
    holidayOverrideDate?: string | null
    workDays?: ReadonlyArray<number>
  }
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const { hour, minute } = convertTimeFromTzToDeviceLocal(
    timeHHMM,
    options?.timezone ?? 'WIB'
  )
  await MonevSync.scheduleAutoFillAlarm({
    enabled,
    hour,
    minute,
    holidayOverrideDate: options?.holidayOverrideDate || '',
    workDaysCsv: (options?.workDays ?? [1, 2, 3, 4, 5]).join(',')
  }).catch(() => {})
}

export async function checkDeviceAlarmPermissions(): Promise<DeviceAlarmPermissions> {
  if (!Capacitor.isNativePlatform()) {
    return {
      canScheduleExactAlarms: true,
      ignoringBatteryOptimizations: true
    }
  }
  try {
    return await MonevSync.getDeviceAlarmStatus()
  } catch {
    return {
      canScheduleExactAlarms: true,
      ignoringBatteryOptimizations: true
    }
  }
}

export async function openDeviceAlarmPermissionSettings(
  target: 'exact_alarm' | 'battery'
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await MonevSync.openDeviceAlarmSettings({ target }).catch(() => {})
}

export interface OpenPortalOptions {
  portalUrl: string
  autoCloseOnLogin?: boolean
  onDashboardVerify?: () => Promise<boolean>
  onAfterClose?: () => void
}

export async function openMonevPortalInApp(
  options: OpenPortalOptions
): Promise<void> {
  const { portalUrl, autoCloseOnLogin = false, onDashboardVerify, onAfterClose } =
    options

  if (!Capacitor.isNativePlatform()) {
    window.open(portalUrl, '_blank', 'noopener,noreferrer')
    return
  }

  let finished = false
  const verifyWithDelays = (delaysMs: number[]) => {
    for (const delay of delaysMs) {
      setTimeout(async () => {
        if (finished) return
        const ok = await onDashboardVerify?.()
        if (ok && !finished) {
          finished = true
          navHandle?.remove().catch(() => {})
          closedHandle.remove().catch(() => {})
          await InAppBrowser.close().catch(() => {})
        }
      }, delay)
    }
  }

  const navHandle = autoCloseOnLogin
    ? await InAppBrowser.addListener(
        'browserPageNavigationCompleted',
        ({ url }) => {
          if (finished || !url) return
          if (
            url.startsWith('https://monev.maganghub.kemnaker.go.id/sso/callback') ||
            url.startsWith(
              'https://monev.maganghub.kemnaker.go.id/authenticate/login/callback'
            )
          ) {
            verifyWithDelays([1800, 4000, 6500])
            return
          }
          if (url.startsWith('https://monev.maganghub.kemnaker.go.id/dashboard')) {
            verifyWithDelays([1200])
          }
        }
      )
    : null

  const closedHandle = await InAppBrowser.addListener('browserClosed', () => {
    if (finished) return
    finished = true
    navHandle?.remove().catch(() => {})
    closedHandle.remove().catch(() => {})
    onAfterClose?.()
  })

  await InAppBrowser.openInWebView({
    url: portalUrl,
    options: {
      showURL: true,
      showToolbar: true,
      clearCache: false,
      clearSessionCache: false,
      mediaPlaybackRequiresUserAction: false,
      closeButtonText: 'Tutup & Cek',
      toolbarPosition: ToolbarPosition.TOP,
      showNavigationButtons: true,
      leftToRight: false,
      android: {
        allowZoom: true,
        hardwareBack: true,
        pauseMedia: true
      },
      iOS: {
        allowOverScroll: true,
        enableViewportScale: true,
        allowInLineMediaPlayback: true,
        surpressIncrementalRendering: false,
        viewStyle: iOSViewStyle.FULL_SCREEN,
        animationEffect: iOSAnimation.COVER_VERTICAL,
        allowsBackForwardNavigationGestures: true
      }
    }
  })
}

export async function clearPortalSessionCookie(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await MonevSync.clearPortalSession().catch(() => {})
  }
}
