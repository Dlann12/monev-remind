<script setup lang="ts">
import type { NotificationLog } from '@/types/app'

interface Props {
  notifications: ReadonlyArray<NotificationLog>
}

interface Emits {
  close: []
  markAllRead: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kotak Masuk Notifikasi"
      @click.self="emit('close')"
    >
      <div
        class="bg-surface-container-lowest w-full max-w-lg max-h-[80vh] rounded-t-2xl sm:rounded-2xl p-space-md pb-safe flex flex-col gap-3 shadow-xl"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-headline-sm text-headline-sm text-on-surface">
              Notifikasi &amp; Log Pengingat
            </h2>
            <p class="font-body-sm text-body-sm text-on-surface-variant">
              Riwayat alarm lokal, catch-up, &amp; status sesi
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="text-secondary font-label-md text-label-md hover:underline"
              @click="emit('markAllRead')"
            >
              Tandai Dibaca
            </button>
            <button
              type="button"
              aria-label="Tutup notifikasi"
              class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant"
              @click="emit('close')"
            >
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <div class="overflow-y-auto space-y-2 pr-1">
          <div
            v-if="notifications.length === 0"
            class="bg-surface-container-low rounded-xl p-6 text-center text-on-surface-variant font-body-sm text-body-sm"
          >
            Belum ada notifikasi yang tercatat.
          </div>

          <div
            v-for="item in notifications"
            :key="item.id ?? item.createdAt"
            class="rounded-xl p-3 space-y-1"
            :class="item.read ? 'bg-surface-container-low' : 'bg-surface-container'"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-label-md text-label-md text-on-surface font-semibold">
                {{ item.title }}
              </span>
              <span class="font-label-sm text-label-sm text-on-surface-variant flex-shrink-0">
                {{ formatTimestamp(item.createdAt) }}
              </span>
            </div>
            <p class="font-body-sm text-body-sm text-on-surface-variant">
              {{ item.body }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

