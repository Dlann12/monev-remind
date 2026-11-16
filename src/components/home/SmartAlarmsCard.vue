<script setup lang="ts">
import type { AlarmRule } from '@/types/app'

interface Props {
  alarms: ReadonlyArray<AlarmRule>
  activeAlarmsCount: number
}

interface Emits {
  toggleAlarm: [alarmId: string]
  testAlarm: []
  openScheduleTab: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <div
          class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary"
        >
          <span class="material-symbols-outlined text-[20px]">
            notifications_active
          </span>
        </div>
        <div>
          <h3 class="font-title-md text-title-md text-on-surface">
            Alarm &amp; Pengingat Otomatis
          </h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Berbunyi jika Monev belum diisi hingga 17:00
          </p>
        </div>
      </div>
      <span
        class="inline-flex items-center gap-1 bg-secondary-fixed/50 text-on-secondary-fixed px-2 py-0.5 rounded font-label-sm text-label-sm flex-shrink-0"
      >
        <span class="material-symbols-outlined text-[14px]">volume_up</span>
        {{ activeAlarmsCount }} Aktif
      </span>
    </div>

    <div class="space-y-2 pt-1">
      <div
        v-for="alarm in alarms"
        :key="alarm.id"
        class="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low gap-2"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            :class="
              alarm.kind === 'snooze'
                ? 'bg-error-container/70 text-on-error-container'
                : 'bg-surface-container-highest text-on-surface'
            "
          >
            <span class="material-symbols-outlined text-[16px]">
              {{ alarm.icon }}
            </span>
          </div>
          <div class="min-w-0">
            <p class="font-label-md text-label-md text-on-surface font-semibold truncate">
              {{ alarm.title }}
            </p>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate">
              {{ alarm.subtitle }}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          :aria-checked="alarm.enabled"
          :aria-label="`Toggle ${alarm.title}`"
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
          :class="alarm.enabled ? 'bg-secondary' : 'bg-outline-variant'"
          @click="emit('toggleAlarm', alarm.id)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out mt-0.5 ml-0.5"
            :class="alarm.enabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between pt-1 gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-secondary font-label-md text-label-md hover:underline"
        @click="emit('testAlarm')"
      >
        <span class="material-symbols-outlined text-[17px]">campaign</span>
        <span>Uji Bunyi &amp; Popup Alarm</span>
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 text-primary font-label-md text-label-md hover:underline"
        @click="emit('openScheduleTab')"
      >
        <span>Ubah Jam</span>
        <span class="material-symbols-outlined text-[16px]">chevron_right</span>
      </button>
    </div>
  </div>
</template>
