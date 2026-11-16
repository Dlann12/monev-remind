import Dexie, { type Table } from 'dexie'
import type {
  AlarmRule,
  InternProfile,
  MonevRecord,
  NotificationLog,
  ScheduleConfig
} from '@/types/app'

export class MagangHubDB extends Dexie {
  profile!: Table<InternProfile, string>
  schedule!: Table<ScheduleConfig, string>
  alarms!: Table<AlarmRule, string>
  records!: Table<MonevRecord, string>
  notifications!: Table<NotificationLog, number>

  constructor() {
    super('MagangHubMonevReminderDB')
    this.version(1).stores({
      profile: 'id',
      schedule: 'id',
      alarms: 'id, key, kind, enabled',
      records: 'date, status',
      notifications: '++id, createdAt, type, read'
    })
  }
}

export const db = new MagangHubDB()

export const DEFAULT_PROFILE: InternProfile = {
  id: 'default',
  portalUserId: '',
  name: 'Peserta MagangHub',
  initials: 'MH',
  role: 'Menunggu sinkronisasi akun',
  company: 'Monev Kemnaker RI',
  batch: 'Profil & sesi mengikuti akun monev.maganghub.kemnaker.go.id',
  photoUrl: '',
  portalUrl: 'https://monev.maganghub.kemnaker.go.id/dashboard',
  telegramBotToken: '',
  telegramChatId: '',
  sessionLastVerifiedAt: null,
  sessionTimeoutHours: 12,
  portalSyncState: 'disconnected',
  lastPortalSyncAt: null,
  lastPortalSyncNote: 'Belum terhubung ke akun Monev MagangHub',
  portalAccessToken: ''
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  id: 'default',
  workDays: [1, 2, 3, 4, 5],
  monevCheckTime: '17:00',
  snoozeEnabled: true,
  timezone: 'WIB',
  syncNationalHolidays: true
}

export const DEFAULT_ALARMS: AlarmRule[] = [
  {
    id: 'alarm_primary',
    key: 'primary',
    title: 'Alarm Utama Monev (17:00)',
    subtitle: 'Pukul 17:00 WIB • Pengingat pengisian absen Monev harian',
    time: '17:00',
    icon: 'alarm_on',
    enabled: true,
    kind: 'primary'
  },
  {
    id: 'alarm_snooze_1',
    key: 'snooze_1',
    title: 'Pengingat Ulang / Snooze #1',
    subtitle: 'Pukul 17:30 WIB • Muncul jika Monev belum diisi',
    time: '17:30',
    icon: 'snooze',
    enabled: true,
    kind: 'snooze'
  },
  {
    id: 'alarm_snooze_2',
    key: 'snooze_2',
    title: 'Eskalasi Akhir / Snooze #2',
    subtitle: 'Pukul 18:00 WIB • Alarm kritis sebelum batas hari kerja',
    time: '18:00',
    icon: 'notification_important',
    enabled: true,
    kind: 'snooze'
  }
]

export async function seedInitialData(): Promise<void> {
  const existingProfile = await db.profile.get('default')
  if (!existingProfile) {
    await db.profile.put(DEFAULT_PROFILE)
  } else if (
    existingProfile.portalSyncState === 'disconnected' &&
    existingProfile.name === 'Dimas Prasetya'
  ) {
    // Clean up legacy placeholder profile so it mirrors real Monev account state
    await db.profile.put({
      ...DEFAULT_PROFILE,
      telegramBotToken: existingProfile.telegramBotToken,
      telegramChatId: existingProfile.telegramChatId
    })
    await db.records.clear()
  }

  const existingSchedule = await db.schedule.get('default')
  if (!existingSchedule) {
    await db.schedule.put(DEFAULT_SCHEDULE)
  }

  const alarmCount = await db.alarms.count()
  if (alarmCount === 0) {
    await db.alarms.bulkPut(DEFAULT_ALARMS)
  }
}
