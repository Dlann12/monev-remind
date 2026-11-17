<script setup lang="ts">
interface Props {
  stats: {
    filled: number
    onLeave: number
    missed: number
    total: number
    percentage: number
  }
  targetTimeLabel?: string
}

interface Emits {
  openHistory: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-title-md text-title-md text-on-surface">
          Kepatuhan Pengisian Monev
        </h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant">
          Target ketepatan waktu &ge; 95% sebelum {{ targetTimeLabel || '18:00' }}
        </p>
      </div>
      <span class="font-headline-sm text-headline-sm text-secondary font-bold">
        {{ stats.percentage }}%
      </span>
    </div>

    <div class="space-y-1.5">
      <div class="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
        <div
          class="bg-secondary h-full rounded-full transition-all duration-500"
          :style="{ width: `${stats.percentage}%` }"
        />
      </div>
      <div class="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
        <span>
          {{
            stats.total === 0
              ? 'Belum ada riwayat pengecekan'
              : `${stats.filled} dari ${stats.total} hari kerja terisi`
          }}
        </span>
        <button
          type="button"
          class="text-secondary font-semibold hover:underline"
          @click="emit('openHistory')"
        >
          Lihat Riwayat &rarr;
        </button>
      </div>
    </div>
  </div>
</template>

