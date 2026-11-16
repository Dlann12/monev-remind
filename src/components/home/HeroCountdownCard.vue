<script setup lang="ts">
import { computed } from 'vue'
import type { InternProfile, MonevRecord, ScheduleConfig } from '@/types/app'

interface Props {
  profile: InternProfile
  schedule: ScheduleConfig
  record: MonevRecord
  statusMeta: {
    state: 'pending' | 'overdue' | 'filled' | 'holiday'
    badge: string
    heading: string
    subtitle: string
  }
  countdownText: string
  isSessionExpired: boolean
  isSyncing: boolean
}

interface Emits {
  openPortal: []
  syncNow: []
  openConnectModal: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isFilled = computed(() => props.record.status === 'terisi')
const isHoliday = computed(() => props.statusMeta.state === 'holiday')

const syncBadge = computed(() => {
  if (props.isSessionExpired || props.profile.portalSyncState === 'session_expired') {
    return {
      text: 'SESI HABIS',
      classes: 'bg-error-container text-on-error-container'
    }
  }
  if (props.profile.portalSyncState === 'connected') {
    return {
      text: 'AUTO-SYNC',
      classes: 'bg-on-tertiary-container/30 text-secondary-fixed'
    }
  }
  return {
    text: 'PERLU CEK',
    classes: 'bg-surface-container-lowest/20 text-secondary-fixed'
  }
})

const lastSyncLabel = computed(() => {
  if (!props.profile.lastPortalSyncAt) {
    return 'Status otomatis mengikuti data Monev MagangHub'
  }
  const timeStr = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(props.profile.lastPortalSyncAt))
  return `Sinkron terakhir pukul ${timeStr} • ${props.profile.lastPortalSyncNote}`
})
</script>

<template>
  <div
    class="relative overflow-hidden bg-primary-container text-on-primary rounded-xl p-space-md shadow-md"
  >
    <div
      class="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-secondary/20 pointer-events-none blur-2xl"
    />
    <div class="absolute right-4 top-4 opacity-10 pointer-events-none">
      <span class="material-symbols-outlined text-[100px] text-on-primary">
        schedule
      </span>
    </div>

    <div class="relative z-10 flex flex-col space-y-space-md">
      <!-- Card Header & Status Badge -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span
            class="p-1.5 bg-secondary/30 rounded-lg text-secondary-fixed flex items-center justify-center"
          >
            <span class="material-symbols-outlined text-[20px]">alarm_on</span>
          </span>
          <span
            class="font-label-lg text-label-lg tracking-wide uppercase text-secondary-fixed"
          >
            Pengingat Monev {{ schedule.monevCheckTime }}
          </span>
        </div>

        <div
          class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm text-label-sm whitespace-nowrap flex-shrink-0"
          :class="
            isFilled
              ? 'bg-on-tertiary-container/30 text-secondary-fixed'
              : isHoliday
                ? 'bg-surface-container-lowest/20 text-on-primary'
                : 'bg-error-container text-on-error-container'
          "
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="
              isFilled
                ? 'bg-tertiary-fixed'
                : isHoliday
                  ? 'bg-on-primary'
                  : 'bg-error animate-pulse'
            "
          />
          <span>{{ statusMeta.badge }}</span>
        </div>
      </div>

      <!-- Heading -->
      <div>
        <h2 class="font-headline-md text-headline-md text-on-primary">
          {{ statusMeta.heading }}
        </h2>
        <p class="font-body-sm text-body-sm text-on-primary-container mt-0.5">
          {{ statusMeta.subtitle }}
        </p>
      </div>

      <!-- Live Countdown Display -->
      <div class="bg-primary/60 rounded-xl p-3 flex items-center justify-between">
        <div class="flex flex-col">
          <span
            class="font-label-sm text-label-sm text-secondary-fixed uppercase tracking-wider"
          >
            {{
              isFilled
                ? 'Status Hari Ini (Otomatis dari Monev)'
                : `Hitung Mundur Menuju ${schedule.monevCheckTime} ${schedule.timezone}`
            }}
          </span>
          <div class="flex items-baseline gap-1 mt-0.5">
            <span
              class="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-on-primary font-mono"
            >
              {{ isFilled ? 'SUDAH DIISI' : countdownText }}
            </span>
            <span
              v-if="!isFilled"
              class="font-label-sm text-label-sm text-on-primary-container"
            >
              jam:mnt:dtk
            </span>
          </div>
        </div>
        <div
          class="w-12 h-12 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary-fixed"
        >
          <span
            class="material-symbols-outlined text-[28px]"
            :class="{ 'animate-pulse': !isFilled && !isHoliday }"
          >
            {{ isFilled ? 'task_alt' : 'timelapse' }}
          </span>
        </div>
      </div>

      <!-- Real Portal Connection Row (FR-02 / FR-04) -->
      <div
        class="bg-surface-container-lowest/10 backdrop-blur-sm rounded-lg p-2.5 flex items-center gap-2"
      >
        <button
          type="button"
          class="flex items-center gap-2 flex-1 min-w-0 text-left"
          @click="emit('openConnectModal')"
        >
          <div
            class="w-7 h-7 rounded-full bg-on-tertiary-container/20 flex items-center justify-center text-secondary-fixed flex-shrink-0"
          >
            <span class="material-symbols-outlined text-[16px]">
              {{ isSessionExpired ? 'lock_clock' : 'sync_lock' }}
            </span>
          </div>
          <div class="flex flex-col min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="font-label-md text-label-md text-on-primary font-semibold truncate">
                monev.maganghub.kemnaker.go.id
              </span>
              <span
                class="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0"
                :class="syncBadge.classes"
              >
                {{ syncBadge.text }}
              </span>
            </div>
            <span class="font-body-sm text-body-sm text-on-primary-container text-[11px] truncate">
              {{ lastSyncLabel }}
            </span>
          </div>
        </button>

        <button
          type="button"
          aria-label="Sinkronkan status Monev sekarang"
          class="w-8 h-8 rounded-lg bg-surface-container-lowest/15 hover:bg-surface-container-lowest/25 flex items-center justify-center text-secondary-fixed flex-shrink-0"
          :disabled="isSyncing"
          @click="emit('syncNow')"
        >
          <span
            class="material-symbols-outlined text-[18px]"
            :class="{ 'animate-spin': isSyncing }"
          >
            sync
          </span>
        </button>
      </div>

      <!-- Primary Actions -->
      <div class="pt-1 flex flex-col gap-2">
        <button
          type="button"
          class="w-full bg-secondary text-on-secondary font-label-lg text-label-lg py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          @click="emit('openPortal')"
        >
          <span class="material-symbols-outlined text-[20px]">open_in_new</span>
          <span>
            {{ isFilled ? 'Buka Portal Monev Kemnaker' : 'Buka & Isi Monev Sekarang' }}
          </span>
        </button>

        <button
          type="button"
          class="w-full bg-surface-container-lowest/15 hover:bg-surface-container-lowest/25 text-on-primary font-label-md text-label-md py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          :disabled="isSyncing"
          @click="emit('syncNow')"
        >
          <span
            class="material-symbols-outlined text-[18px]"
            :class="{ 'animate-spin': isSyncing }"
          >
            sync
          </span>
          <span>{{ isSyncing ? 'Mengecek Status di Monev...' : 'Cek Ulang Status dari Monev' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
