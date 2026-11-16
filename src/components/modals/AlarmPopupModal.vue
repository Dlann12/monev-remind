<script setup lang="ts">
import type { ActiveReminderAlert } from '@/composables/useReminderEngine'

interface Props {
  alert: ActiveReminderAlert
  isSyncing: boolean
}

interface Emits {
  dismiss: []
  syncNow: []
  openPortal: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 bg-primary/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Alarm Pengingat Monev MagangHub"
      @click.self="emit('dismiss')"
    >
      <div
        class="bg-surface-container-lowest w-full max-w-md rounded-t-2xl sm:rounded-2xl p-space-lg pb-safe space-y-4 shadow-2xl"
      >
        <div class="flex items-start gap-3">
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            :class="
              alert.isSessionWarning
                ? 'bg-error-container text-error'
                : 'bg-secondary-fixed/60 text-secondary'
            "
          >
            <span class="material-symbols-outlined text-[28px] animate-bounce">
              notifications_active
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <span
              class="inline-block font-label-sm text-label-sm uppercase tracking-wider px-2 py-0.5 rounded-full mb-1"
              :class="
                alert.isSessionWarning
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-primary-fixed text-on-primary-fixed'
              "
            >
              Pengingat Aktif
            </span>
            <h2 class="font-headline-sm text-headline-sm text-on-surface leading-snug">
              {{ alert.title }}
            </h2>
          </div>
        </div>

        <p class="font-body-md text-body-md text-on-surface-variant">
          {{ alert.body }}
        </p>

        <div class="space-y-2 pt-1">
          <button
            type="button"
            class="w-full bg-secondary text-on-secondary py-3.5 px-4 rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md"
            @click="emit('openPortal')"
          >
            <span class="material-symbols-outlined text-[20px]">open_in_new</span>
            <span>{{ alert.isSessionWarning ? 'Login & Cek Portal Monev' : 'Isi Monev Sekarang' }}</span>
          </button>

          <button
            type="button"
            class="w-full bg-primary text-on-primary py-3 px-4 rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2"
            :disabled="isSyncing"
            @click="emit('syncNow')"
          >
            <span
              class="material-symbols-outlined text-[20px]"
              :class="{ 'animate-spin': isSyncing }"
            >
              sync
            </span>
            <span>{{ isSyncing ? 'Mengecek Portal Monev...' : 'Cek Ulang Status di Monev' }}</span>
          </button>

          <button
            type="button"
            class="w-full bg-surface-container-low text-on-surface-variant py-2.5 px-4 rounded-xl font-label-md text-label-md"
            @click="emit('dismiss')"
          >
            Ingatkan Lagi Nanti (Snooze)
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
