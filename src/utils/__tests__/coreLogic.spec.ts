import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ALARMS, DEFAULT_SCHEDULE } from '@/db/database'
import type { MonevRecord } from '@/types/app'
import {
  convertTimeFromTzToDeviceLocal,
  formatCountdown,
  getCountdownSeconds,
  getShiftedDate,
  isSessionLikelyExpired,
  isWorkdayActive,
  shouldTriggerAutoFill2300,
  shouldTriggerCatchUp,
  syncAlarmRuleDisplay
} from '@/utils/dateTime'
import {
  MONEV_MIN_CHARS,
  autoSubmitMonevFromYesterday,
  buildCompleteMonevHistory,
  ensureMinMonevLength,
  findLatestDailyLogPayload,
  mapOffDaysToWorkDays,
  normalizeDailyLogDraftForSubmit,
  parseMonevAttendancesPayload,
  parseMonevHomePayload,
  parseMonevUserPayload
} from '@/services/monevPortalService'

describe('Workday, holiday, 17:00 catch-up, and 23:00 auto-fill logic', () => {
  it('marks Monday-Friday as active workdays when not a holiday', () => {
    const monday = new Date('2026-11-16T10:00:00+07:00')
    const sunday = new Date('2026-11-15T10:00:00+07:00')
    expect(isWorkdayActive(monday, DEFAULT_SCHEDULE, null)).toBe(true)
    expect(isWorkdayActive(sunday, DEFAULT_SCHEDULE, null)).toBe(false)
  })

  it('pauses workday on Indonesian national holidays when sync is enabled', () => {
    const independenceDay = new Date('2026-08-17T10:00:00+07:00')
    expect(isWorkdayActive(independenceDay, DEFAULT_SCHEDULE, null)).toBe(false)
  })

  it('pauses workday when Libur Hari Ini override is active', () => {
    const monday = new Date('2026-11-16T10:00:00+07:00')
    const holidayRecord: MonevRecord = {
      date: '2026-11-16',
      status: 'libur',
      filledAt: null,
      isHolidayOverride: true
    }
    expect(isWorkdayActive(monday, DEFAULT_SCHEDULE, holidayRecord)).toBe(false)
  })

  it('triggers catch-up alarm after 17:00 only when Monev is not filled', () => {
    const beforeFive = new Date('2026-11-16T16:45:00+07:00')
    const afterFive = new Date('2026-11-16T17:15:00+07:00')

    const unfilled: MonevRecord = {
      date: '2026-11-16',
      status: 'belum',
      filledAt: null,
      isHolidayOverride: false
    }

    const filled: MonevRecord = {
      date: '2026-11-16',
      status: 'terisi',
      filledAt: '2026-11-16T17:05:00.000Z',
      isHolidayOverride: false
    }

    expect(shouldTriggerCatchUp(beforeFive, DEFAULT_SCHEDULE, unfilled)).toBe(false)
    expect(shouldTriggerCatchUp(afterFive, DEFAULT_SCHEDULE, unfilled)).toBe(true)
    expect(shouldTriggerCatchUp(afterFive, DEFAULT_SCHEDULE, filled)).toBe(false)
  })

  it('triggers 23:00 auto-fill on unfilled active workdays at/after 23:00 only once', () => {
    const at2259 = new Date('2026-11-16T22:59:00+07:00')
    const at2300 = new Date('2026-11-16T23:00:00+07:00')
    const sundayAt2300 = new Date('2026-11-15T23:00:00+07:00')

    const unfilled: MonevRecord = {
      date: '2026-11-16',
      status: 'belum',
      filledAt: null,
      isHolidayOverride: false
    }
    const filled: MonevRecord = {
      date: '2026-11-16',
      status: 'terisi',
      filledAt: '2026-11-16T17:00:00.000Z',
      isHolidayOverride: false
    }
    const onLeave: MonevRecord = {
      date: '2026-11-16',
      status: 'izin',
      filledAt: null,
      isHolidayOverride: false
    }

    expect(shouldTriggerAutoFill2300(at2259, DEFAULT_SCHEDULE, unfilled)).toBe(false)
    expect(shouldTriggerAutoFill2300(at2300, DEFAULT_SCHEDULE, unfilled)).toBe(true)
    expect(shouldTriggerAutoFill2300(at2300, DEFAULT_SCHEDULE, filled)).toBe(false)
    expect(shouldTriggerAutoFill2300(at2300, DEFAULT_SCHEDULE, onLeave)).toBe(false)
    expect(shouldTriggerAutoFill2300(sundayAt2300, DEFAULT_SCHEDULE, unfilled)).toBe(false)
    expect(
      shouldTriggerAutoFill2300(
        at2300,
        { ...DEFAULT_SCHEDULE, autoFillAt2300: false },
        unfilled
      )
    ).toBe(false)
    expect(
      shouldTriggerAutoFill2300(
        at2300,
        { ...DEFAULT_SCHEDULE, lastAutoFilledDate: '2026-11-16' },
        unfilled
      )
    ).toBe(false)
  })

  it('detects likely expired portal session (FR-04)', () => {
    const now = new Date('2026-11-16T17:00:00.000Z')
    const fresh = new Date('2026-11-16T15:00:00.000Z').toISOString()
    const stale = new Date('2026-11-15T10:00:00.000Z').toISOString()

    expect(isSessionLikelyExpired(null, 12, now)).toBe(true)
    expect(isSessionLikelyExpired(fresh, 12, now)).toBe(false)
    expect(isSessionLikelyExpired(stale, 12, now)).toBe(true)
  })

  it('synchronizes alarm title and subtitle when time or timezone changes', () => {
    const primary = syncAlarmRuleDisplay(DEFAULT_ALARMS[0]!, '16:15', 'WITA')
    expect(primary.time).toBe('16:15')
    expect(primary.title).toBe('Alarm Utama Monev (16:15)')
    expect(primary.subtitle).toBe(
      'Pukul 16:15 WITA • Pengingat pengisian absen Monev harian'
    )

    const snooze = syncAlarmRuleDisplay(DEFAULT_ALARMS[1]!, '19:45', 'WIT')
    expect(snooze.time).toBe('19:45')
    expect(snooze.title).toBe('Pengingat Ulang / Snooze #1')
    expect(snooze.subtitle).toBe(
      'Pukul 19:45 WIT • Muncul jika Monev belum diisi'
    )
  })
})

describe('17:00 Countdown helper', () => {
  it('computes and formats countdown HH:MM:SS to 17:00', () => {
    const now = new Date('2026-11-16T16:35:42')
    const secs = getCountdownSeconds(now, '17:00')
    expect(secs).toBe(24 * 60 + 18)
    expect(formatCountdown(secs)).toBe('00:24:18')
  })
})

describe('Monev API parsers, complete history, and daily-log copy helpers', () => {
  it('detects filled, unfilled, and off-day states from Kemnaker API shape', () => {
    expect(
      parseMonevHomePayload({
        data: { has_attendance: true, is_scheduled_off_day: false, is_holiday: false }
      })
    ).toBe('filled')

    expect(
      parseMonevHomePayload({
        data: { has_attendance: false, is_scheduled_off_day: false, is_holiday: false }
      })
    ).toBe('unfilled')

    expect(
      parseMonevHomePayload({
        data: { has_attendance: false, is_scheduled_off_day: true, is_holiday: false }
      })
    ).toBe('off_day')

    expect(
      parseMonevHomePayload({
        data: { has_attendance: false, is_scheduled_off_day: false, is_holiday: true }
      })
    ).toBe('off_day')
  })

  it('parses /users/me profile data including off_days and location codes', () => {
    const parsed = parseMonevUserPayload({
      data: {
        id: 'usr-123',
        name: 'Siti Aminah',
        user_type: 'peserta',
        internship_company: 'PT Pos Indonesia',
        internship_position: 'Data Analyst Intern',
        photo_url: 'https://cdn.kemnaker.go.id/avatar.jpg',
        internship_start_date: '2026-09-01',
        internship_end_date: '2027-02-28',
        internship_location_province_code: '32',
        internship_location_regency_code: '3273',
        off_days: ['SUNDAY']
      }
    })

    expect(parsed).toEqual({
      portalUserId: 'usr-123',
      name: 'Siti Aminah',
      initials: 'SA',
      role: 'Data Analyst Intern',
      company: 'PT Pos Indonesia',
      batch: 'Periode 1 Sep 2026 – 28 Feb 2027',
      photoUrl: 'https://cdn.kemnaker.go.id/avatar.jpg',
      startDate: '2026-09-01',
      endDate: '2027-02-28',
      provinceCode: '32',
      regencyCode: '3273',
      offDays: ['SUNDAY']
    })
    expect(mapOffDaysToWorkDays(['SUNDAY'])).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('parses /attendances history records from Monev MagangHub API', () => {
    const history = parseMonevAttendancesPayload({
      data: [
        { date: '2026-11-12T00:00:00Z', status: 'ON_LEAVE', approval_status: 'SUBMITTED' },
        { date: '2026-11-15T00:00:00Z', status: 'DAYOFF' },
        { date: '2026-11-14T00:00:00Z', status: 'PRESENT', approval_status: 'APPROVED' },
        { date: '2026-11-13T00:00:00Z', status: 'ABSENT' }
      ]
    })

    expect(history.map((r) => [r.date, r.status, r.approvalStatus])).toEqual([
      ['2026-11-15', 'libur', ''],
      ['2026-11-14', 'terisi', 'APPROVED'],
      ['2026-11-13', 'terlewat', ''],
      ['2026-11-12', 'izin', 'SUBMITTED']
    ])
  })

  it('builds complete daily history including PRESENT, ON_LEAVE, ABSENT, regional/national holidays, weekends, and unfilled days', () => {
    const complete = buildCompleteMonevHistory({
      startDate: '2026-11-11',
      endDate: '2027-02-28',
      todayKey: '2026-11-17',
      provinceCode: '32',
      regencyCode: '3273',
      offDays: ['SATURDAY', 'SUNDAY'],
      attendances: [
        { date: '2026-11-11', status: 'ABSENT' },
        { date: '2026-11-12', status: 'ON_LEAVE', leave_reason: 'Sakit demam', approval_status: 'APPROVED' },
        { date: '2026-11-16', status: 'PRESENT', approval_status: 'SUBMITTED' }
      ],
      dailyLogs: [
        {
          date: '2026-11-16',
          activity_log: 'Mengerjakan integrasi API dashboard magang beserta unit test',
          lesson_learned: 'Memahami alur autentikasi SSO dan sinkronisasi data',
          obstacles: 'Tidak ada kendala berarti',
          state: 'SUBMITTED'
        }
      ],
      holidays: [
        { date: '2026-11-13', name: 'Cuti Bersama Provinsi', scope: 'PROVINCE', province_code: '32' },
        { date: '2026-11-17', name: 'Libur Daerah Lain', scope: 'REGENCY', regency_code: '9999' }
      ]
    })

    expect(
      complete.map((r) => ({
        date: r.date,
        status: r.status,
        holidayName: r.holidayName,
        leaveReason: r.leaveReason,
        activityLog: r.activityLog
      }))
    ).toEqual([
      { date: '2026-11-17', status: 'belum', holidayName: undefined, leaveReason: undefined, activityLog: undefined },
      {
        date: '2026-11-16',
        status: 'terisi',
        holidayName: undefined,
        leaveReason: '',
        activityLog: 'Mengerjakan integrasi API dashboard magang beserta unit test'
      },
      { date: '2026-11-15', status: 'libur', holidayName: 'Akhir Pekan / Hari Libur', leaveReason: undefined, activityLog: undefined },
      { date: '2026-11-14', status: 'libur', holidayName: 'Akhir Pekan / Hari Libur', leaveReason: undefined, activityLog: undefined },
      { date: '2026-11-13', status: 'libur', holidayName: 'Cuti Bersama Provinsi', leaveReason: undefined, activityLog: undefined },
      { date: '2026-11-12', status: 'izin', holidayName: undefined, leaveReason: 'Sakit demam', activityLog: '' },
      { date: '2026-11-11', status: 'terlewat', holidayName: undefined, leaveReason: '', activityLog: '' }
    ])
  })

  it('finds most recent prior daily-log draft for 23:00 auto-fill copy', () => {
    const draft = findLatestDailyLogPayload(
      [
        { date: '2026-11-17', activity_log: 'Should ignore today' },
        { date: '2026-11-15', activity_log: '   ' },
        {
          date: '2026-11-13',
          activity_log: 'Membantu tim frontend memperbaiki komponen tabel laporan',
          lesson_learned: 'Belajar state management Vue 3',
          obstacles: 'Perlu penyesuaian styling mobile'
        },
        {
          date: '2026-11-16',
          activity_log: 'Melakukan testing end-to-end dan dokumentasi API Kemnaker',
          lesson_learned: 'Memahami validasi form Monev',
          obstacles: 'Tidak ada kendala'
        }
      ],
      '2026-11-17'
    )

    expect(draft).toEqual({
      sourceDate: '2026-11-16',
      activity_log: 'Melakukan testing end-to-end dan dokumentasi API Kemnaker',
      lesson_learned: 'Memahami validasi form Monev',
      obstacles: 'Tidak ada kendala'
    })
  })
})

describe('Kemnaker 100-character minimum enforcement', () => {
  it('pads empty and short inputs to at least 100 characters while preserving long text', () => {
    const emptyAct = ensureMinMonevLength('', 'activity')
    const shortLesson = ensureMinMonevLength('Belajar Vue 3', 'lesson')
    const shortObs = ensureMinMonevLength('Tidak ada kendala.', 'obstacles')
    const longText = 'A'.repeat(120)

    expect(emptyAct.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(shortLesson.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(shortLesson.startsWith('Belajar Vue 3. ')).toBe(true)
    expect(shortObs.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(shortObs.startsWith('Tidak ada kendala. ')).toBe(true)
    expect(ensureMinMonevLength(longText, 'activity')).toBe(longText)
  })

  it('normalizes all three daily-log fields before submit', () => {
    const normalized = normalizeDailyLogDraftForSubmit({
      sourceDate: '2026-11-16',
      activity_log: 'Fixing bug dashboard',
      lesson_learned: '',
      obstacles: 'Tidak ada'
    })
    expect(normalized.activity_log.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(normalized.lesson_learned.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(normalized.obstacles.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
  })
})

describe('Indonesian timezone conversion (WIB / WITA / WIT)', () => {
  it('shifts wall-clock date/hours accurately across WIB, WITA, and WIT', () => {
    const instant = new Date('2026-11-16T16:30:00.000Z') // 23:30 WIB, 00:30+1 WITA, 01:30+1 WIT
    const wib = getShiftedDate(instant, 'WIB')
    const wita = getShiftedDate(instant, 'WITA')
    const wit = getShiftedDate(instant, 'WIT')

    expect(wib.getDate()).toBe(16)
    expect(wib.getHours()).toBe(23)
    expect(wib.getMinutes()).toBe(30)

    expect(wita.getDate()).toBe(17)
    expect(wita.getHours()).toBe(0)
    expect(wita.getMinutes()).toBe(30)

    expect(wit.getDate()).toBe(17)
    expect(wit.getHours()).toBe(1)
    expect(wit.getMinutes()).toBe(30)
  })

  it('computes countdown seconds accurately for WIB, WITA, and WIT', () => {
    const instant = new Date('2026-11-16T15:30:00+07:00') // 15:30 WIB, 16:30 WITA, 17:30 WIT
    expect(getCountdownSeconds(instant, '17:00', 'WIB')).toBe(90 * 60)
    expect(getCountdownSeconds(instant, '17:00', 'WITA')).toBe(30 * 60)
    expect(getCountdownSeconds(instant, '17:00', 'WIT')).toBe(0)
  })

  it('converts source timezone alarm times to device local time with consistent offsets', () => {
    const ref = new Date('2026-11-16T05:00:00.000Z')
    const fromWib = convertTimeFromTzToDeviceLocal('17:00', 'WIB', ref)
    const fromWita = convertTimeFromTzToDeviceLocal('17:00', 'WITA', ref)
    const fromWit = convertTimeFromTzToDeviceLocal('17:00', 'WIT', ref)

    const wibTotal = fromWib.dayDelta * 1440 + fromWib.hour * 60 + fromWib.minute
    const witaTotal = fromWita.dayDelta * 1440 + fromWita.hour * 60 + fromWita.minute
    const witTotal = fromWit.dayDelta * 1440 + fromWit.hour * 60 + fromWit.minute

    expect(wibTotal - witaTotal).toBe(60)
    expect(wibTotal - witTotal).toBe(120)
  })
})

describe('autoSubmitMonevFromYesterday fetch flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns already_filled when portal reports attendance already exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { has_attendance: true, is_scheduled_off_day: false, is_holiday: false }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )

    const res = await autoSubmitMonevFromYesterday({
      accessToken: 'test-token',
      targetDate: '2026-11-16'
    })
    expect(res.outcome).toBe('already_filled')
  })

  it('returns off_day when portal reports holiday or scheduled off day', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { has_attendance: false, is_scheduled_off_day: false, is_holiday: true }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )

    const res = await autoSubmitMonevFromYesterday({
      accessToken: 'test-token',
      targetDate: '2026-11-16'
    })
    expect(res.outcome).toBe('off_day')
  })

  it('returns session_expired when portal responds with HTTP 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    )

    const res = await autoSubmitMonevFromYesterday({
      accessToken: 'expired-token',
      targetDate: '2026-11-16'
    })
    expect(res.outcome).toBe('session_expired')
  })

  it('normalizes short fields to >= 100 chars and submits POST payload on unfilled workday', async () => {
    let postedBody: Record<string, string> | null = null
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/users/me/home')) {
        return new Response(
          JSON.stringify({
            data: { has_attendance: false, is_scheduled_off_day: false, is_holiday: false }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/attendances/with-daily-log')) {
        postedBody = JSON.parse(String(init?.body || '{}')) as Record<string, string>
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    const res = await autoSubmitMonevFromYesterday({
      accessToken: 'valid-token',
      targetDate: '2026-11-16',
      customDraft: {
        sourceDate: '2026-11-13',
        activity_log: 'Mengerjakan integrasi API',
        lesson_learned: 'Belajar TypeScript',
        obstacles: 'Tidak ada'
      }
    })

    expect(res.outcome).toBe('submitted')
    expect(postedBody).not.toBeNull()
    expect(postedBody!.date).toBe('2026-11-16')
    expect(postedBody!.status).toBe('PRESENT')
    expect(postedBody!.activity_log!.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(postedBody!.lesson_learned!.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
    expect(postedBody!.obstacles!.length).toBeGreaterThanOrEqual(MONEV_MIN_CHARS)
  })
})
