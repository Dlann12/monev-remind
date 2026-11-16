import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE } from '@/db/database'
import type { MonevRecord } from '@/types/app'
import {
  formatCountdown,
  getCountdownSeconds,
  isSessionLikelyExpired,
  isWorkdayActive,
  shouldTriggerCatchUp
} from '@/utils/dateTime'
import {
  parseMonevAttendancesPayload,
  parseMonevHomePayload,
  parseMonevUserPayload
} from '@/services/monevPortalService'

describe('Workday, holiday, and 17:00 catch-up reminder logic', () => {
  it('marks Monday-Friday as active workdays when not a holiday', () => {
    const monday = new Date('2026-11-16T10:00:00')
    const sunday = new Date('2026-11-15T10:00:00')
    expect(isWorkdayActive(monday, DEFAULT_SCHEDULE, null)).toBe(true)
    expect(isWorkdayActive(sunday, DEFAULT_SCHEDULE, null)).toBe(false)
  })

  it('pauses workday on Indonesian national holidays when sync is enabled', () => {
    const independenceDay = new Date('2026-08-17T10:00:00')
    expect(isWorkdayActive(independenceDay, DEFAULT_SCHEDULE, null)).toBe(false)
  })

  it('pauses workday when Libur Hari Ini override is active', () => {
    const monday = new Date('2026-11-16T10:00:00')
    const holidayRecord: MonevRecord = {
      date: '2026-11-16',
      status: 'libur',
      filledAt: null,
      isHolidayOverride: true
    }
    expect(isWorkdayActive(monday, DEFAULT_SCHEDULE, holidayRecord)).toBe(false)
  })

  it('triggers catch-up alarm after 17:00 only when Monev is not filled', () => {
    const beforeFive = new Date('2026-11-16T16:45:00')
    const afterFive = new Date('2026-11-16T17:15:00')

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

  it('detects likely expired portal session (FR-04)', () => {
    const now = new Date('2026-11-16T17:00:00.000Z')
    const fresh = new Date('2026-11-16T15:00:00.000Z').toISOString()
    const stale = new Date('2026-11-15T10:00:00.000Z').toISOString()

    expect(isSessionLikelyExpired(null, 12, now)).toBe(true)
    expect(isSessionLikelyExpired(fresh, 12, now)).toBe(false)
    expect(isSessionLikelyExpired(stale, 12, now)).toBe(true)
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

describe('Monev /users/me/home API parser', () => {
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

  it('parses /users/me profile data from Monev MagangHub response', () => {
    const parsed = parseMonevUserPayload({
      data: {
        id: 'usr-123',
        name: 'Siti Aminah',
        user_type: 'peserta',
        internship_company: 'PT Pos Indonesia',
        internship_position: 'Data Analyst Intern',
        photo_url: 'https://cdn.kemnaker.go.id/avatar.jpg',
        internship_start_date: '2026-09-01',
        internship_end_date: '2027-02-28'
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
      endDate: '2027-02-28'
    })
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
})
