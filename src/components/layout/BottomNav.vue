<script setup lang="ts">
import type { AppTab } from '@/types/app'

interface Props {
  activeTab: AppTab
}

interface Emits {
  changeTab: [tab: AppTab]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const navItems: ReadonlyArray<{ id: AppTab; label: string; icon: string }> = [
  { id: 'beranda', label: 'Beranda', icon: 'dashboard' },
  { id: 'jadwal-alarm', label: 'Jadwal & Alarm', icon: 'alarm' },
  { id: 'riwayat', label: 'Riwayat', icon: 'history' }
]
</script>

<template>
  <nav
    class="sticky bottom-0 w-full z-40 pb-safe bg-surface/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(15,56,96,0.06)]"
    aria-label="Navigasi Utama"
  >
    <div class="h-16 px-space-xs flex items-center justify-around max-w-lg mx-auto">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        :aria-current="activeTab === item.id ? 'page' : undefined"
        class="flex flex-col items-center justify-center min-w-[72px] min-h-[44px] py-1 transition-colors"
        :class="
          activeTab === item.id
            ? 'text-secondary font-semibold'
            : 'text-on-surface-variant hover:text-on-surface'
        "
        @click="emit('changeTab', item.id)"
      >
        <span
          class="material-symbols-outlined text-[24px]"
          :class="{ 'material-symbols-filled': activeTab === item.id }"
        >
          {{ item.icon }}
        </span>
        <span class="font-label-sm text-label-sm mt-0.5 tracking-tight">
          {{ item.label }}
        </span>
      </button>
    </div>
  </nav>
</template>
