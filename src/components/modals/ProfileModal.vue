<script setup lang="ts">
import { computed } from 'vue'
import ProfileAvatar from '@/components/common/ProfileAvatar.vue'
import type { InternProfile } from '@/types/app'

interface Props {
  profile: InternProfile
  isSessionExpired: boolean
  isSyncing: boolean
}

interface Emits {
  close: []
  syncNow: []
  openConnectModal: []
  disconnect: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isConnected = computed(() => props.profile.portalSyncState === 'connected')

const syncTimeLabel = computed(() => {
  if (!props.profile.lastPortalSyncAt) return 'Belum pernah disinkronkan'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(props.profile.lastPortalSyncAt))
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Profil dan Sesi Monev MagangHub"
      @click.self="emit('close')"
    >
      <div
        class="bg-surface-container-lowest w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-space-md pb-safe space-y-4 shadow-xl"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-headline-sm text-headline-sm text-on-surface">
              Profil &amp; Sesi MagangHub
            </h2>
            <p class="font-body-sm text-body-sm text-on-surface-variant">
              Profil &amp; status sesi otomatis mengikuti akun Monev Kemnaker Anda
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup profil"
            class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant"
            @click="emit('close')"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Session State Banner -->
        <div
          class="rounded-xl p-3 flex items-center justify-between gap-2"
          :class="
            isSessionExpired || profile.portalSyncState === 'session_expired'
              ? 'bg-error-container text-on-error-container'
              : isConnected
                ? 'bg-secondary-fixed/40 text-on-secondary-fixed'
                : 'bg-surface-container-low text-on-surface'
          "
        >
          <div class="min-w-0">
            <p class="font-label-md text-label-md font-semibold">
              {{
                isSessionExpired || profile.portalSyncState === 'session_expired'
                  ? 'Sesi MagangHub Habis'
                  : isConnected
                    ? 'Sesi MagangHub Aktif'
                    : 'Belum Terhubung ke MagangHub'
              }}
            </p>
            <p class="font-body-sm text-body-sm opacity-85 truncate">
              Sinkron terakhir: {{ syncTimeLabel }}
            </p>
          </div>

          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm flex items-center gap-1 flex-shrink-0"
            :disabled="isSyncing"
            @click="isConnected ? emit('syncNow') : emit('openConnectModal')"
          >
            <span
              class="material-symbols-outlined text-[14px]"
              :class="{ 'animate-spin': isSyncing }"
            >
              sync
            </span>
            <span>{{ isConnected ? 'Sinkron' : 'Hubungkan' }}</span>
          </button>
        </div>

        <!-- Synced Read-Only Profile Details -->
        <div class="bg-surface-container-low rounded-xl p-3.5 space-y-3">
          <div class="flex items-center gap-3">
            <ProfileAvatar
              :src="isConnected ? profile.photoUrl : ''"
              :alt="profile.name"
              :initials="profile.initials"
              size-class="w-12 h-12"
              bg-class="bg-primary text-on-primary"
            />
            <div class="min-w-0">
              <p class="font-title-md text-title-md text-on-surface truncate">
                {{ profile.name }}
              </p>
              <p class="font-body-sm text-body-sm text-on-surface-variant truncate">
                {{ profile.role }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 pt-1 text-body-sm">
            <div class="bg-surface-container-lowest rounded-lg p-2.5">
              <span class="block font-label-sm text-label-sm text-on-surface-variant">
                Mitra / Perusahaan
              </span>
              <span class="font-label-md text-label-md text-on-surface">
                {{ profile.company }}
              </span>
            </div>

            <div class="bg-surface-container-lowest rounded-lg p-2.5">
              <span class="block font-label-sm text-label-sm text-on-surface-variant">
                Periode / Program
              </span>
              <span class="font-label-md text-label-md text-on-surface">
                {{ profile.batch }}
              </span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <button
            type="button"
            class="w-full bg-secondary text-on-secondary py-3 px-4 rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2"
            @click="emit('openConnectModal')"
          >
            <span class="material-symbols-outlined text-[20px]">login</span>
            <span>
              {{
                isConnected
                  ? 'Kelola / Login Ulang Akun Monev'
                  : 'Hubungkan Akun Monev MagangHub'
              }}
            </span>
          </button>

          <button
            v-if="profile.portalSyncState !== 'disconnected'"
            type="button"
            class="w-full bg-error-container text-on-error-container py-2.5 px-4 rounded-xl font-label-md text-label-md"
            @click="emit('disconnect')"
          >
            Putuskan Sesi dari Perangkat
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
