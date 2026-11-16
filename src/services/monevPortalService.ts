import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  InAppBrowser,
  ToolbarPosition,
  iOSAnimation,
  iOSViewStyle
} from '@capacitor/inappbrowser'
import type { MonevDayStatus, MonevRecord } from '@/types/app'
import { toLocalDateKey } from '@/utils/dateTime'

export interface MonevUserApiPayload {
  id?: string
  name?: string
  user_type?: string
  company?: string
  internship_company?: string
  internship_position?: string
  position?: string
  photo_url?: string
  internship_start_date?: string
  internship_end_date?: string
  data?: MonevUserApiPayload
}

export interface MonevAttendanceApiItem {
  id?: string
  date?: string
  status?: 'PRESENT' | 'ON_LEAVE' | 'ABSENT' | 'DAYOFF' | string
  approval_status?: 'APPROVED' | 'SUBMITTED' | 'REJECTED' | string
  created_at?: string
  updated_at?: string
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
}

interface MonevSyncPlugin {
  checkTodayStatus(options?: { accessToken?: string }): Promise<{
    state: 'ok' | 'session_expired' | 'unavailable'
    hasAttendance?: boolean
    isScheduledOffDay?: boolean
    isHoliday?: boolean
    accessToken?: string
    user?: MonevUserApiPayload
    attendances?: MonevAttendanceApiItem[]
    httpStatus?: number
    reason?: string
    error?: string
  }>
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
  note: string
  checkedAt: string
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

  return {
    portalUserId: u?.id ? String(u.id) : '',
    name,
    initials: computeInitials(name),
    role,
    company,
    batch: formatShortPeriod(u?.internship_start_date, u?.internship_end_date),
    photoUrl: u?.photo_url?.trim() || '',
    startDate: u?.internship_start_date?.slice(0, 10) || '',
    endDate: u?.internship_end_date?.slice(0, 10) || ''
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
      isHolidayOverride: status === 'libur'
    })
  }

  return Array.from(byDate.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  )
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

async function runSingleCheck(accessToken?: string): Promise<MonevStatusCheckResult> {
  const checkedAt = new Date().toISOString()

  if (Capacitor.isNativePlatform()) {
    const res = await MonevSync.checkTodayStatus({
      accessToken: accessToken?.trim() || ''
    })

    if (res.state === 'ok') {
      const outcome =
        res.isScheduledOffDay || res.isHoliday
          ? 'off_day'
          : res.hasAttendance
            ? 'filled'
            : 'unfilled'
      return {
        outcome,
        accessToken: res.accessToken,
        userProfile: parseMonevUserPayload(res.user),
        historyRecords: res.attendances
          ? parseMonevAttendancesPayload(res.attendances)
          : undefined,
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
      fetch('/monev-api/users/me', { method: 'GET', headers })
    ])

    if (
      homeRes.status === 401 ||
      homeRes.status === 403 ||
      userRes.status === 401 ||
      userRes.status === 403
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
    const userJson = userRes.ok
      ? ((await userRes.json()) as MonevUserApiPayload)
      : undefined
    const userProfile = parseMonevUserPayload(userJson)
    const outcome = parseMonevHomePayload(homeJson)

    let historyRecords: MonevRecord[] | undefined
    if (userProfile?.portalUserId && userProfile.startDate) {
      const todayStr = toLocalDateKey(new Date())
      const endDate =
        userProfile.endDate && userProfile.endDate < todayStr
          ? userProfile.endDate
          : todayStr
      if (endDate >= userProfile.startDate) {
        const params = new URLSearchParams({
          participant_id: userProfile.portalUserId,
          start_date: userProfile.startDate,
          end_date: endDate,
          limit: '500'
        })
        const attRes = await fetch(`/monev-api/attendances?${params.toString()}`, {
          method: 'GET',
          headers
        })
        if (attRes.ok) {
          const attJson = (await attRes.json()) as { data?: MonevAttendanceApiItem[] }
          historyRecords = parseMonevAttendancesPayload(attJson)
        }
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
 * Checks today's Monev status, user profile, and attendance history with retry.
 */
export async function checkMonevTodayStatus(
  accessToken?: string,
  maxAttempts = 3
): Promise<MonevStatusCheckResult> {
  let lastResult = await runSingleCheck(accessToken)
  let attempt = 1

  while (lastResult.outcome === 'unavailable' && attempt < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1200 * attempt))
    lastResult = await runSingleCheck(accessToken)
    attempt++
  }

  return lastResult
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
  const navHandle = autoCloseOnLogin
    ? await InAppBrowser.addListener(
        'browserPageNavigationCompleted',
        ({ url }) => {
          if (
            finished ||
            !url ||
            !url.startsWith('https://monev.maganghub.kemnaker.go.id/dashboard')
          ) {
            return
          }
          setTimeout(async () => {
            if (finished) return
            const ok = await onDashboardVerify?.()
            if (ok && !finished) {
              finished = true
              navHandle?.remove().catch(() => {})
              closedHandle.remove().catch(() => {})
              await InAppBrowser.close().catch(() => {})
            }
          }, 1200)
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
