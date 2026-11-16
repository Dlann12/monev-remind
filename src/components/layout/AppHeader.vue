<script setup lang="ts">
import { computed } from 'vue'
import type { AppTab, PortalSyncState } from '@/types/app'

interface Props {
  activeTab: AppTab
  unreadCount: number
  portalSyncState: PortalSyncState
  isSessionExpired: boolean
  photoUrl: string
}

interface Emits {
  openNotifications: []
  openProfile: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const tabLabelMap: Record<AppTab, string> = {
  beranda: 'Beranda',
  'jadwal-alarm': 'Jadwal & Alarm',
  riwayat: 'Riwayat'
}

const activeTabLabel = computed(() => tabLabelMap[props.activeTab])

const statusDotClass = computed(() => {
  if (props.isSessionExpired || props.portalSyncState === 'session_expired') {
    return 'bg-error'
  }
  if (props.portalSyncState === 'connected') {
    return 'bg-on-tertiary-container'
  }
  return 'bg-outline-variant'
})
</script>

<template>
  <header
    class="sticky top-0 w-full z-40 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(15,56,96,0.05)]"
  >
    <div class="h-16 px-margin flex items-center justify-between max-w-lg mx-auto">
      <div class="flex items-center gap-space-sm">
        <div
          class="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm flex-shrink-0"
          aria-hidden="true"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="8" stroke="#8cf2ff" stroke-width="2" />
            <path
              d="M12 7.5V12L14.8 15.6"
              stroke="#ffffff"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="17.5" cy="6.5" r="2.4" fill="#00b592" />
          </svg>
        </div>

        <div class="flex flex-col">
          <div class="flex items-center gap-space-xs">
            <span class="font-title-md text-title-md text-primary tracking-tight">
              MagangHub
            </span>
            <span
              class="bg-secondary/10 text-secondary font-label-sm text-label-sm px-1.5 py-0.5 rounded-full uppercase tracking-wider"
            >
              Kemnaker RI
            </span>
          </div>
          <span
            class="font-body-sm text-body-sm text-on-surface-variant font-medium leading-none"
          >
            {{ activeTabLabel }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-space-sm">
        <button
          type="button"
          aria-label="Notifikasi Penting"
          class="w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors relative"
          @click="emit('openNotifications')"
        >
          <span class="material-symbols-outlined text-[22px]">notifications</span>
          <span
            v-if="unreadCount > 0"
            class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-error ring-2 ring-surface"
          />
        </button>

        <button
          type="button"
          aria-label="Profil & Sesi Monev MagangHub"
          class="relative flex items-center justify-center rounded-full focus:outline-none"
          @click="emit('openProfile')"
        >
          <div
            class="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm overflow-hidden"
          >
            <img
              v-if="photoUrl"
              :src="photoUrl"
              alt="Avatar MagangHub"
              class="w-full h-full object-cover"
            />
            <span v-else class="material-symbols-outlined text-on-primary text-[18px]">
              person
            </span>
          </div>
          <span
            class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface"
            :class="statusDotClass"
          />
        </button>
      </div>
    </div>
  </header>
</template>
