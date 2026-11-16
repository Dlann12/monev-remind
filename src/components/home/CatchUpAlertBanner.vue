<script setup lang="ts">
interface Props {
  isCatchUpNeeded: boolean
  isSessionExpired: boolean
  isSyncing: boolean
  monevCheckTime: string
  timezone: string
}

interface Emits {
  openPortal: []
  syncNow: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div
    v-if="isCatchUpNeeded || isSessionExpired"
    class="rounded-xl p-3.5 shadow-sm border space-y-2.5 bg-error-container/70 border-error/20 text-on-error-container"
  >
    <div class="flex items-start gap-2.5">
      <span class="material-symbols-outlined text-[20px] mt-0.5 flex-shrink-0">
        {{ isSessionExpired ? 'lock_clock' : 'warning' }}
      </span>
      <div class="flex-1 min-w-0">
        <p class="font-label-lg text-label-lg leading-tight">
          {{
            isSessionExpired
              ? 'Sesi MagangHub Habis'
              : `Pengingat Tertunda: Lewat Pukul ${monevCheckTime} ${timezone}`
          }}
        </p>
        <p class="font-body-sm text-body-sm mt-0.5 opacity-90">
          {{
            isSessionExpired
              ? 'Sesi MagangHub habis. Login & cek apakah Monev hari ini sudah diisi.'
              : 'Status di Monev MagangHub hari ini masih terbaca belum diisi.'
          }}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md"
        @click="emit('openPortal')"
      >
        <span>{{ isSessionExpired ? 'Login & Cek Portal' : 'Buka & Isi Monev' }}</span>
        <span class="material-symbols-outlined text-[15px]">open_in_new</span>
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md"
        :disabled="isSyncing"
        @click="emit('syncNow')"
      >
        <span
          class="material-symbols-outlined text-[15px]"
          :class="{ 'animate-spin': isSyncing }"
        >
          sync
        </span>
        <span>{{ isSyncing ? 'Mengecek...' : 'Cek Status Monev' }}</span>
      </button>
    </div>
  </div>
</template>
