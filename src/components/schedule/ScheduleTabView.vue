<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import type {
  AlarmRule,
  InternProfile,
  ScheduleConfig,
  TimezoneLabel
} from '@/types/app'

interface Props {
  schedule: ScheduleConfig
  alarms: ReadonlyArray<AlarmRule>
  profile: InternProfile
  isHolidayToday: boolean
  nationalHolidayName: string | null
}

interface Emits {
  updateSchedule: [patch: Partial<ScheduleConfig>]
  toggleAlarm: [alarmId: string]
  updateAlarmTime: [alarmId: string, time: string]
  toggleHolidayToday: []
  testAlarm: []
  updateProfile: [patch: Partial<InternProfile>]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const dayLabels = [
  { id: 1, short: 'Sen' },
  { id: 2, short: 'Sel' },
  { id: 3, short: 'Rab' },
  { id: 4, short: 'Kam' },
  { id: 5, short: 'Jum' },
  { id: 6, short: 'Sab' },
  { id: 7, short: 'Min' }
] as const

const timezones: TimezoneLabel[] = ['WIB', 'WITA', 'WIT']

const monevCheckTime = shallowRef(props.schedule.monevCheckTime)
const botToken = shallowRef(props.profile.telegramBotToken)
const chatId = shallowRef(props.profile.telegramChatId)
const telegramSavedMsg = shallowRef('')

watch(
  () => props.schedule.monevCheckTime,
  (val) => {
    monevCheckTime.value = val
  }
)

function toggleWorkDay(dayId: number) {
  const exists = props.schedule.workDays.includes(dayId)
  const next = exists
    ? props.schedule.workDays.filter((d) => d !== dayId)
    : [...props.schedule.workDays, dayId].sort((a, b) => a - b)
  if (next.length === 0) return
  emit('updateSchedule', { workDays: next })
}

function saveMonevCheckTime() {
  if (!monevCheckTime.value) return
  emit('updateSchedule', { monevCheckTime: monevCheckTime.value })
}

function saveTelegramConfig() {
  emit('updateProfile', {
    telegramBotToken: botToken.value.trim(),
    telegramChatId: chatId.value.trim()
  })
  telegramSavedMsg.value = 'Konfigurasi Telegram tersimpan lokal di perangkat.'
  setTimeout(() => {
    telegramSavedMsg.value = ''
  }, 3000)
}
</script>

<template>
  <div class="flex flex-col w-full px-margin space-y-space-md">
    <!-- Mode Libur & Hari Kerja (FR-06) -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="font-title-md text-title-md text-on-surface">
            Hari Kerja &amp; Mode Libur
          </h2>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Alarm hanya aktif di hari kerja dan otomatis dijeda saat libur/cuti.
          </p>
        </div>
        <button
          type="button"
          class="px-3 py-1.5 rounded-full font-label-md text-label-md transition-colors flex-shrink-0"
          :class="
            isHolidayToday
              ? 'bg-secondary text-on-secondary'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
          "
          @click="emit('toggleHolidayToday')"
        >
          {{ isHolidayToday ? 'Libur Aktif' : 'Libur Hari Ini' }}
        </button>
      </div>

      <div
        v-if="nationalHolidayName"
        class="bg-secondary-fixed/40 text-on-secondary-fixed rounded-lg p-2.5 flex items-center gap-2 font-label-md text-label-md"
      >
        <span class="material-symbols-outlined text-[18px]">celebration</span>
        <span>Libur Nasional Terdeteksi: {{ nationalHolidayName }}</span>
      </div>

      <div>
        <span class="block font-label-md text-label-md text-on-surface-variant mb-2">
          Hari Kerja Aktif
        </span>
        <div class="grid grid-cols-7 gap-1.5">
          <button
            v-for="day in dayLabels"
            :key="day.id"
            type="button"
            class="py-2 rounded-lg font-label-md text-label-md transition-colors"
            :class="
              schedule.workDays.includes(day.id)
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-low text-on-surface-variant'
            "
            @click="toggleWorkDay(day.id)"
          >
            {{ day.short }}
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between bg-surface-container-low rounded-lg p-2.5">
        <div>
          <p class="font-label-md text-label-md text-on-surface font-semibold">
            Sinkron Kalender Libur Nasional RI
          </p>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Database tanggal merah 2025–2027 tersimpan offline
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="schedule.syncNationalHolidays"
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
          :class="schedule.syncNationalHolidays ? 'bg-secondary' : 'bg-outline-variant'"
          @click="
            emit('updateSchedule', {
              syncNationalHolidays: !schedule.syncNationalHolidays
            })
          "
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow transition mt-0.5 ml-0.5"
            :class="schedule.syncNationalHolidays ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <!-- Jam Pengingat Utama & Zona Waktu (FR-01) -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div>
        <h3 class="font-title-md text-title-md text-on-surface">
          Jadwal Pengingat Utama (Default 17:00)
        </h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant">
          Jika Monev belum diisi sampai jam ini, alarm &amp; notifikasi muncul otomatis.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <label class="bg-surface-container-low rounded-lg p-2.5 flex flex-col gap-1">
          <span class="font-label-sm text-label-sm text-on-surface-variant">
            Jam Pengingat Utama
          </span>
          <input
            v-model="monevCheckTime"
            type="time"
            class="bg-transparent font-title-md text-title-md text-on-surface focus:outline-none"
            @change="saveMonevCheckTime"
          />
        </label>

        <div class="bg-surface-container-low rounded-lg p-2.5 flex flex-col gap-1">
          <span class="font-label-sm text-label-sm text-on-surface-variant">
            Zona Waktu
          </span>
          <div class="flex gap-1 pt-0.5">
            <button
              v-for="tz in timezones"
              :key="tz"
              type="button"
              class="flex-1 py-1 rounded-md font-label-md text-label-md"
              :class="
                schedule.timezone === tz
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container-lowest text-on-surface-variant'
              "
              @click="emit('updateSchedule', { timezone: tz })"
            >
              {{ tz }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alarm Utama & Eskalasi Snooze (FR-03 & FR-05) -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="font-title-md text-title-md text-on-surface">
            Alarm &amp; Pengingat Ulang (Snooze)
          </h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Otomatis berhenti saat status hari ini ditandai Sudah Diisi.
          </p>
        </div>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md flex items-center gap-1 flex-shrink-0"
          @click="emit('testAlarm')"
        >
          <span class="material-symbols-outlined text-[16px]">volume_up</span>
          <span>Uji Alarm</span>
        </button>
      </div>

      <div class="space-y-2">
        <div
          v-for="alarm in alarms"
          :key="alarm.id"
          class="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low gap-2"
        >
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              :class="
                alarm.kind === 'snooze'
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-surface-container-highest text-on-surface'
              "
            >
              <span class="material-symbols-outlined text-[17px]">
                {{ alarm.icon }}
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-label-md text-label-md text-on-surface font-semibold truncate">
                {{ alarm.title }}
              </p>
              <p class="font-body-sm text-body-sm text-on-surface-variant truncate">
                {{ alarm.subtitle }}
              </p>
            </div>
          </div>

          <input
            :value="alarm.time"
            type="time"
            aria-label="Ubah jam alarm"
            class="bg-surface-container-lowest rounded-md px-1.5 py-1 font-label-md text-label-md text-primary w-20 text-center"
            @change="
              emit(
                'updateAlarmTime',
                alarm.id,
                ($event.target as HTMLInputElement).value
              )
            "
          />

          <button
            type="button"
            role="switch"
            :aria-checked="alarm.enabled"
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
            :class="alarm.enabled ? 'bg-secondary' : 'bg-outline-variant'"
            @click="emit('toggleAlarm', alarm.id)"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow transition mt-0.5 ml-0.5"
              :class="alarm.enabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- FR-07 Optional Telegram Webhook Escalation -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-title-md text-title-md text-on-surface">
            Notifikasi Telegram (Opsional)
          </h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Tersimpan lokal. Mengirim pesan pengingat ke HP saat online jika pukul 17:00 masih kosong.
          </p>
        </div>
        <span
          class="bg-surface-container text-on-surface-variant font-label-sm text-label-sm px-2 py-0.5 rounded-full"
        >
          Opsional
        </span>
      </div>

      <div class="space-y-2">
        <input
          v-model="botToken"
          type="password"
          placeholder="Bot Token Telegram (mis. 123456:ABC-DEF...)"
          class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
        />
        <input
          v-model="chatId"
          type="text"
          placeholder="Chat ID Telegram (mis. 987654321)"
          class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
        />
      </div>

      <div class="flex items-center justify-between gap-2">
        <span class="font-body-sm text-body-sm text-secondary">
          {{ telegramSavedMsg }}
        </span>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-primary text-on-primary font-label-md text-label-md"
          @click="saveTelegramConfig"
        >
          Simpan Telegram
        </button>
      </div>
    </div>
  </div>
</template>
