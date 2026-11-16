export type AppTab = 'beranda' | 'jadwal-alarm' | 'riwayat'

export type TimezoneLabel = 'WIB' | 'WITA' | 'WIT'

export type MonevDayStatus = 'belum' | 'terisi' | 'izin' | 'libur' | 'terlewat'

export type AlarmKind = 'primary' | 'snooze'

export type PortalSyncState =
  | 'disconnected'
  | 'connected'
  | 'session_expired'
  | 'unavailable'

export interface InternProfile {
  id: 'default'
  portalUserId: string
  name: string
  initials: string
  role: string
  company: string
  batch: string
  photoUrl: string
  portalUrl: string
  telegramBotToken: string
  telegramChatId: string
  sessionLastVerifiedAt: string | null
  sessionTimeoutHours: number
  portalSyncState: PortalSyncState
  lastPortalSyncAt: string | null
  lastPortalSyncNote: string
  portalAccessToken: string
}

export interface ScheduleConfig {
  id: 'default'
  workDays: readonly number[] // 1 = Senin ... 7 = Minggu
  monevCheckTime: string // Default '17:00'
  snoozeEnabled: boolean
  timezone: TimezoneLabel
  syncNationalHolidays: boolean
}

export interface AlarmRule {
  id: string
  key: string
  title: string
  subtitle: string
  time: string // HH:mm
  icon: string
  enabled: boolean
  kind: AlarmKind
  lastTriggeredDate?: string
}

export interface MonevRecord {
  date: string // YYYY-MM-DD
  status: MonevDayStatus
  filledAt: string | null // ISO timestamp
  approvalStatus?: string
  isHolidayOverride: boolean
}

export interface NotificationLog {
  id?: number
  createdAt: string // ISO string
  title: string
  body: string
  type: 'alarm' | 'catch_up' | 'session_expired' | 'info'
  read: boolean
}
