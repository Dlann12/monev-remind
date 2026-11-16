<script setup lang="ts">
import type {
  AlarmRule,
  AppTab,
  InternProfile,
  MonevRecord,
  ScheduleConfig
} from '@/types/app'
import CatchUpAlertBanner from './CatchUpAlertBanner.vue'
import ComplianceSummaryCard from './ComplianceSummaryCard.vue'
import HeroCountdownCard from './HeroCountdownCard.vue'
import ProfileBanner from './ProfileBanner.vue'
import SmartAlarmsCard from './SmartAlarmsCard.vue'

interface Props {
  profile: InternProfile
  schedule: ScheduleConfig
  alarms: ReadonlyArray<AlarmRule>
  activeAlarmsCount: number
  todayKey: string
  todayRecord: MonevRecord
  nationalHolidayName: string | null
  isCatchUpNeeded: boolean
  isSessionExpired: boolean
  isSyncingPortal: boolean
  statusMeta: {
    state: 'pending' | 'overdue' | 'filled' | 'holiday'
    badge: string
    heading: string
    subtitle: string
  }
  countdownText: string
  complianceStats: {
    filled: number
    onLeave: number
    missed: number
    total: number
    percentage: number
  }
}

interface Emits {
  toggleHoliday: []
  toggleAlarm: [alarmId: string]
  testAlarm: []
  openPortal: []
  syncNow: []
  openConnectModal: []
  navigateTab: [tab: AppTab]
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="flex flex-col w-full px-margin space-y-space-md">
    <CatchUpAlertBanner
      :is-catch-up-needed="isCatchUpNeeded"
      :is-session-expired="isSessionExpired"
      :is-syncing="isSyncingPortal"
      :monev-check-time="schedule.monevCheckTime"
      :timezone="schedule.timezone"
      @open-portal="emit('openPortal')"
      @sync-now="emit('syncNow')"
    />

    <ProfileBanner
      :profile="profile"
      :schedule="schedule"
      :today-date-key="todayKey"
      :is-holiday-today="
        todayRecord.isHolidayOverride || todayRecord.status === 'libur'
      "
      :national-holiday-name="nationalHolidayName"
      @toggle-holiday="emit('toggleHoliday')"
      @open-connect-modal="emit('openConnectModal')"
    />

    <HeroCountdownCard
      :profile="profile"
      :schedule="schedule"
      :record="todayRecord"
      :status-meta="statusMeta"
      :countdown-text="countdownText"
      :is-session-expired="isSessionExpired"
      :is-syncing="isSyncingPortal"
      @open-portal="emit('openPortal')"
      @sync-now="emit('syncNow')"
      @open-connect-modal="emit('openConnectModal')"
    />

    <SmartAlarmsCard
      :alarms="alarms"
      :active-alarms-count="activeAlarmsCount"
      @toggle-alarm="emit('toggleAlarm', $event)"
      @test-alarm="emit('testAlarm')"
      @open-schedule-tab="emit('navigateTab', 'jadwal-alarm')"
    />

    <ComplianceSummaryCard
      :stats="complianceStats"
      @open-history="emit('navigateTab', 'riwayat')"
    />
  </div>
</template>
