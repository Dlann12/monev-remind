<script setup lang="ts">
import { computed } from 'vue'
import type { InternProfile, ScheduleConfig } from '@/types/app'
import { formatIndonesianDate } from '@/utils/dateTime'

interface Props {
  profile: InternProfile
  schedule: ScheduleConfig
  todayDateKey: string
  isHolidayToday: boolean
  nationalHolidayName: string | null
}

interface Emits {
  toggleHoliday: []
  openConnectModal: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formattedDate = computed(() => formatIndonesianDate(props.todayDateKey))
const isConnected = computed(() => props.profile.portalSyncState === 'connected')
</script>

<template>
  <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
    <div class="flex items-start justify-between gap-space-sm">
      <div class="flex flex-col min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="font-headline-sm text-headline-sm text-on-surface">
            {{ isConnected ? `Halo, ${profile.name}!` : 'Akun Monev MagangHub' }}
          </span>
          <span v-if="isConnected" class="text-base select-none" aria-hidden="true">👋</span>
        </div>
        <p class="font-body-sm text-body-sm text-on-surface-variant font-medium mt-1 truncate">
          {{ profile.role }} • {{ profile.company }}
        </p>
        <p class="font-label-sm text-label-sm text-secondary font-medium mt-0.5">
          {{ profile.batch }}
        </p>
      </div>

      <button
        type="button"
        aria-label="Lihat profil MagangHub"
        class="flex-shrink-0 rounded-full focus:outline-none"
        @click="emit('openConnectModal')"
      >
        <div
          class="w-11 h-11 rounded-full bg-secondary-fixed/40 flex items-center justify-center text-secondary font-title-md text-title-md overflow-hidden"
        >
          <img
            v-if="profile.photoUrl && isConnected"
            :src="profile.photoUrl"
            :alt="profile.name"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ profile.initials }}</span>
        </div>
      </button>
    </div>

    <div
      class="mt-space-md pt-3 flex items-center justify-between flex-wrap gap-2 bg-surface-container-low rounded-lg p-2.5"
    >
      <div class="flex items-center gap-1.5 text-on-surface-variant">
        <span class="material-symbols-outlined text-[18px] text-primary">
          calendar_today
        </span>
        <span class="font-label-md text-label-md text-on-surface">
          {{ formattedDate }}
        </span>
      </div>

      <div class="flex items-center gap-1.5 flex-wrap">
        <div
          class="inline-flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-full shadow-xs"
        >
          <span class="relative flex h-2 w-2">
            <span
              v-if="!isHolidayToday"
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-tertiary-container opacity-75"
            />
            <span
              class="relative inline-flex rounded-full h-2 w-2"
              :class="isHolidayToday ? 'bg-outline' : 'bg-on-tertiary-container'"
            />
          </span>
          <span class="font-label-sm text-label-sm text-on-surface font-semibold">
            {{
              nationalHolidayName
                ? `Libur: ${nationalHolidayName}`
                : isHolidayToday
                  ? 'Mode Libur / Izin'
                  : `Cek Harian (${schedule.monevCheckTime} ${schedule.timezone})`
            }}
          </span>
        </div>

        <button
          v-if="!nationalHolidayName"
          type="button"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-full font-label-sm text-label-sm transition-colors"
          :class="
            isHolidayToday
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          "
          @click="emit('toggleHoliday')"
        >
          <span class="material-symbols-outlined text-[13px]">
            {{ isHolidayToday ? 'event_available' : 'beach_access' }}
          </span>
          <span>{{ isHolidayToday ? 'Aktifkan Kerja' : 'Libur Hari Ini' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
