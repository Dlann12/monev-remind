<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import {
  isNativePlatform,
  registerAppResumeListener
} from '@/services/capacitorBridge'
import {
  checkDeviceAlarmPermissions,
  openDeviceAlarmPermissionSettings,
  type DeviceAlarmPermissions
} from '@/services/monevPortalService'
import {
  CALLMEBOT_BOT_PHONE,
  CALLMEBOT_GUIDE_URL,
  DEFAULT_WA_RELAY_URL,
  getCallMeBotActivationUrl,
  isValidWhatsAppPhone,
  normalizeIndonesianPhone
} from '@/services/whatsappService'
import type {
  AlarmRule,
  InternProfile,
  ScheduleConfig,
  TimezoneLabel,
  WhatsAppProvider
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
  testWhatsapp: [
    config: {
      whatsappEnabled: boolean
      whatsappProvider: WhatsAppProvider
      whatsappPhone: string
      whatsappApiKey: string
      whatsappWebhookUrl: string
    }
  ]
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
const autoFillTime = shallowRef(props.schedule.autoFillTime || '23:00')
const botToken = shallowRef(props.profile.telegramBotToken)
const chatId = shallowRef(props.profile.telegramChatId)
const telegramSavedMsg = shallowRef('')

const waEnabled = shallowRef(Boolean(props.profile.whatsappEnabled))
const waProvider = shallowRef<WhatsAppProvider>(
  props.profile.whatsappProvider || (DEFAULT_WA_RELAY_URL ? 'relay' : 'callmebot')
)
const waPhone = shallowRef(props.profile.whatsappPhone || '')
const waApiKey = shallowRef(props.profile.whatsappApiKey || '')
const waWebhookUrl = shallowRef(
  props.profile.whatsappWebhookUrl || DEFAULT_WA_RELAY_URL
)
const waSavedMsg = shallowRef('')

const waProviderOptions: ReadonlyArray<{ id: WhatsAppProvider; label: string }> = [
  { id: 'callmebot', label: 'CallMeBot (Gratis)' },
  { id: 'fonnte', label: 'Fonnte' },
  { id: 'relay', label: 'Server Bot WA' },
  { id: 'webhook', label: 'Webhook' }
]

const normalizedWaPhone = computed(() => normalizeIndonesianPhone(waPhone.value))
const isWaPhoneValid = computed(() => isValidWhatsAppPhone(waPhone.value))
const hasBuiltInRelay = Boolean(DEFAULT_WA_RELAY_URL)
const callMeBotUrl = getCallMeBotActivationUrl()

watch(
  () => props.profile,
  (p) => {
    waEnabled.value = Boolean(p.whatsappEnabled)
    waProvider.value =
      p.whatsappProvider || (DEFAULT_WA_RELAY_URL ? 'relay' : 'callmebot')
    waPhone.value = p.whatsappPhone || ''
    waApiKey.value = p.whatsappApiKey || ''
    waWebhookUrl.value = p.whatsappWebhookUrl || DEFAULT_WA_RELAY_URL
  },
  { deep: false }
)

const isNative = isNativePlatform()
const devicePerms = shallowRef<DeviceAlarmPermissions>({
  canScheduleExactAlarms: true,
  ignoringBatteryOptimizations: true
})

let cleanupResume: (() => void) | null = null

async function refreshDevicePerms() {
  if (!isNative) return
  devicePerms.value = await checkDeviceAlarmPermissions()
}

onMounted(() => {
  refreshDevicePerms().catch(() => {})
  cleanupResume = registerAppResumeListener(() => {
    refreshDevicePerms().catch(() => {})
  })
})

onUnmounted(() => {
  if (cleanupResume) cleanupResume()
})

watch(
  () => props.schedule.monevCheckTime,
  (val) => {
    monevCheckTime.value = val
  }
)

watch(
  () => props.schedule.autoFillTime,
  (val) => {
    if (val) autoFillTime.value = val
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
  if (!/^\d{2}:\d{2}$/.test(monevCheckTime.value)) return
  if (monevCheckTime.value === props.schedule.monevCheckTime) return
  emit('updateSchedule', { monevCheckTime: monevCheckTime.value })
}

function saveAutoFillTime() {
  if (!/^\d{2}:\d{2}$/.test(autoFillTime.value)) return
  if (autoFillTime.value === props.schedule.autoFillTime) return
  emit('updateSchedule', { autoFillTime: autoFillTime.value })
}

function handleAlarmTimeInput(
  alarmId: string,
  currentTime: string,
  event: Event
) {
  const nextTime = (event.target as HTMLInputElement).value
  if (!/^\d{2}:\d{2}$/.test(nextTime) || nextTime === currentTime) return
  emit('updateAlarmTime', alarmId, nextTime)
}

function saveWhatsAppConfig() {
  emit('updateProfile', {
    whatsappEnabled: waEnabled.value,
    whatsappProvider: waProvider.value,
    whatsappPhone: waPhone.value.trim(),
    whatsappApiKey: waApiKey.value.trim(),
    whatsappWebhookUrl: waWebhookUrl.value.trim()
  })
  waSavedMsg.value = 'Konfigurasi Bot WhatsApp tersimpan di perangkat.'
  setTimeout(() => {
    waSavedMsg.value = ''
  }, 3000)
}

function handleTestWhatsApp() {
  const payload = {
    whatsappEnabled: true,
    whatsappProvider: waProvider.value,
    whatsappPhone: waPhone.value.trim(),
    whatsappApiKey: waApiKey.value.trim(),
    whatsappWebhookUrl: waWebhookUrl.value.trim()
  }
  waEnabled.value = true
  emit('updateProfile', payload)
  emit('testWhatsapp', payload)
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

    <!-- Auto-Isi Monev Otomatis -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-title-md text-title-md text-on-surface">
            Auto-Isi Monev Pukul {{ schedule.autoFillTime || '23:00' }}
          </h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Jika hingga pukul {{ schedule.autoFillTime || '23:00' }} {{ schedule.timezone }} hari kerja Monev belum diisi, aplikasi otomatis mengirim log harian menyalin kegiatan kemarin.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="schedule.autoFillAt2300"
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
          :class="schedule.autoFillAt2300 ? 'bg-secondary' : 'bg-outline-variant'"
          @click="
            emit('updateSchedule', {
              autoFillAt2300: !schedule.autoFillAt2300
            })
          "
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow transition mt-0.5 ml-0.5"
            :class="schedule.autoFillAt2300 ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2.5 items-center">
        <label class="bg-surface-container-low rounded-lg p-2.5 flex flex-col gap-1">
          <span class="font-label-sm text-label-sm text-on-surface-variant">
            Jam Eksekusi Auto-Isi
          </span>
          <input
            v-model="autoFillTime"
            type="time"
            class="bg-transparent font-title-md text-title-md text-on-surface focus:outline-none"
            @input="saveAutoFillTime"
            @change="saveAutoFillTime"
          />
        </label>

        <div class="bg-surface-container-low rounded-lg p-2.5 text-on-surface-variant font-body-sm text-body-sm">
          <span class="block font-label-sm text-label-sm text-on-surface font-semibold">
            Sumber Kegiatan
          </span>
          Menyalin log aktivitas hari kerja terakhir yang terisi.
        </div>
      </div>

      <div
        v-if="
          isNative &&
          (!devicePerms.canScheduleExactAlarms ||
            !devicePerms.ignoringBatteryOptimizations)
        "
        class="rounded-xl bg-error-container/75 text-on-error-container p-3 space-y-2.5"
      >
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-[18px] mt-0.5 flex-shrink-0">
            warning
          </span>
          <div class="font-body-sm text-body-sm">
            <p class="font-semibold">
              Izin Background Android Perlu Diaktifkan
            </p>
            <p class="mt-0.5 opacity-90">
              Agar alarm &amp; Auto-Isi {{ schedule.autoFillTime || '23:00' }} tetap berjalan tepat waktu saat layar terkunci, izinkan akses berikut:
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="!devicePerms.canScheduleExactAlarms"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-error text-on-error font-label-sm text-label-sm flex items-center gap-1 active:scale-[0.98] transition-transform"
            @click="openDeviceAlarmPermissionSettings('exact_alarm')"
          >
            <span class="material-symbols-outlined text-[15px]">alarm</span>
            <span>Izinkan Alarm Tepat Waktu</span>
          </button>
          <button
            v-if="!devicePerms.ignoringBatteryOptimizations"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-on-error-container text-error-container font-label-sm text-label-sm flex items-center gap-1 active:scale-[0.98] transition-transform"
            @click="openDeviceAlarmPermissionSettings('battery')"
          >
            <span class="material-symbols-outlined text-[15px]">battery_charging_full</span>
            <span>Matikan Pembatasan Baterai</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Jam Pengingat Utama & Zona Waktu (FR-01) -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div>
        <h3 class="font-title-md text-title-md text-on-surface">
          Jadwal Pengingat Utama ({{ schedule.monevCheckTime }} {{ schedule.timezone }})
        </h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant">
          Jika Monev belum diisi sampai pukul {{ schedule.monevCheckTime }} {{ schedule.timezone }}, alarm &amp; notifikasi suara muncul otomatis.
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
            @input="saveMonevCheckTime"
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
            Memutar audio pengingat kustom &amp; berhenti otomatis saat Monev terisi.
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
            @input="handleAlarmTimeInput(alarm.id, alarm.time, $event)"
            @change="handleAlarmTimeInput(alarm.id, alarm.time, $event)"
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

    <!-- Bot Pengingat WhatsApp -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-title-md text-title-md text-on-surface flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[19px] text-secondary">chat</span>
            <span>Bot Pengingat WhatsApp</span>
          </h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Kirim pesan pengingat otomatis ke WhatsApp saat alarm {{ schedule.monevCheckTime }}, snooze, maupun hasil Auto-Isi {{ schedule.autoFillTime || '23:00' }}.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="waEnabled"
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
          :class="waEnabled ? 'bg-secondary' : 'bg-outline-variant'"
          @click="
            () => {
              waEnabled = !waEnabled
              saveWhatsAppConfig()
            }
          "
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow transition mt-0.5 ml-0.5"
            :class="waEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Provider selector -->
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="prov in waProviderOptions"
          :key="prov.id"
          type="button"
          class="py-1.5 px-2.5 rounded-lg font-label-sm text-label-sm transition-colors text-center"
          :class="
            waProvider === prov.id
              ? 'bg-primary text-on-primary shadow-xs'
              : 'bg-surface-container-low text-on-surface-variant'
          "
          @click="waProvider = prov.id"
        >
          {{ prov.label }}
        </button>
      </div>

      <div class="space-y-2">
        <div>
          <input
            v-model="waPhone"
            type="tel"
            placeholder="Nomor WhatsApp (mis. 081234567890)"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
          <p
            v-if="waPhone.trim()"
            class="mt-1 font-label-sm text-label-sm"
            :class="isWaPhoneValid ? 'text-secondary' : 'text-error'"
          >
            {{
              isWaPhoneValid
                ? `Format tujuan WA: +${normalizedWaPhone}`
                : 'Masukkan nomor WA valid (10–15 digit, diawali 08 atau 62).'
            }}
          </p>
        </div>

        <!-- CallMeBot helper -->
        <template v-if="waProvider === 'callmebot'">
          <div class="rounded-lg bg-surface-container-low p-2.5 space-y-2 text-body-sm text-on-surface-variant">
            <p>
              <strong>Gratis tanpa server:</strong> Simpan nomor bot CallMeBot (<strong>{{ CALLMEBOT_BOT_PHONE }}</strong>) ke kontak, lalu kirim pesan <code>I allow callmebot to send me messages</code> untuk mendapatkan API Key di WhatsApp Anda.
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <a
                :href="callMeBotUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-sm text-label-sm"
              >
                <span class="material-symbols-outlined text-[15px]">open_in_new</span>
                <span>Buka WA Aktivasi CallMeBot</span>
              </a>
              <a
                :href="CALLMEBOT_GUIDE_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-primary underline font-label-sm text-label-sm"
              >
                <span>Cek nomor bot terbaru</span>
              </a>
            </div>
          </div>
          <input
            v-model="waApiKey"
            type="password"
            placeholder="API Key CallMeBot (dari balasan WA bot)"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
        </template>

        <!-- Fonnte helper -->
        <template v-else-if="waProvider === 'fonnte'">
          <input
            v-model="waApiKey"
            type="password"
            placeholder="Token API Fonnte (dari dashboard fonnte.com)"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
        </template>

        <!-- Central Bot Relay Server -->
        <template v-else-if="waProvider === 'relay'">
          <div
            v-if="hasBuiltInRelay"
            class="rounded-lg bg-secondary-container/45 text-on-secondary-container px-3 py-2 font-body-sm text-body-sm flex items-center gap-1.5"
          >
            <span class="material-symbols-outlined text-[16px]">check_circle</span>
            <span>Server Bot WA terpasang otomatis — Anda cukup mengisi Nomor WhatsApp saja.</span>
          </div>
          <input
            v-model="waWebhookUrl"
            type="url"
            placeholder="URL Server Bot WA (mis. https://bot-wa.domain.com/api/wa/send)"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
          <input
            v-model="waApiKey"
            type="password"
            placeholder="Relay Secret / Bearer Token (opsional)"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
        </template>

        <!-- Custom Webhook -->
        <template v-else>
          <input
            v-model="waWebhookUrl"
            type="url"
            placeholder="URL Webhook Bot WA (POST JSON { phone, message })"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
          <input
            v-model="waApiKey"
            type="password"
            placeholder="Bearer Token / API Key (opsional)"
            class="w-full bg-surface-container-low rounded-lg px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />
        </template>
      </div>

      <div class="flex items-center justify-between gap-2 flex-wrap">
        <span class="font-body-sm text-body-sm text-secondary">
          {{ waSavedMsg }}
        </span>
        <div class="flex items-center gap-2 ml-auto">
          <button
            type="button"
            class="px-3.5 py-2 rounded-xl bg-surface-container text-primary font-label-md text-label-md flex items-center gap-1"
            @click="handleTestWhatsApp"
          >
            <span class="material-symbols-outlined text-[16px]">send</span>
            <span>Uji Kirim WA</span>
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-xl bg-primary text-on-primary font-label-md text-label-md"
            @click="saveWhatsAppConfig"
          >
            Simpan WA
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
            Tersimpan lokal. Mengirim pesan pengingat ke HP saat online jika pukul {{ schedule.monevCheckTime }} {{ schedule.timezone }} masih kosong.
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
