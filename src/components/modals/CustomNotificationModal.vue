<script setup lang="ts">
import { ref } from 'vue'
import type { AlarmRule, AlarmSoundType } from '@/types/app'
import { previewAlarmSound } from '@/utils/audio'

const props = defineProps<{
  alarm: AlarmRule
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: Partial<AlarmRule>): void
  (e: 'reset', alarmId: string): void
}>()

const DEFAULT_MESSAGE =
  'Jangan lupa isi monev! Absen Monev hari ini belum diisi.'

const title = ref(props.alarm.customTitle || props.alarm.title)
const message = ref(props.alarm.customMessage || DEFAULT_MESSAGE)
const soundType = ref<AlarmSoundType>(props.alarm.soundType || 'voice')
const vibrate = ref(props.alarm.vibrate !== false)
const playingSound = ref<AlarmSoundType | null>(null)

const PRESET_TEMPLATES = [
  {
    label: 'Standar',
    icon: 'notifications',
    text: 'Jangan lupa isi monev! Absen Monev hari ini belum diisi.'
  },
  {
    label: 'Santai',
    icon: 'mood',
    text: 'Yuk selesaikan logbook harian MagangHub sebelum pulang kerja!'
  },
  {
    label: 'Formal',
    icon: 'badge',
    text: 'Mohon segera mengisi dan submit laporan Monev harian di portal Kemnaker.'
  },
  {
    label: 'Peringatan',
    icon: 'warning',
    text: 'Waktu pengisian Monev hampir berakhir, segera laporkan aktivitas Anda!'
  }
]

const SOUND_OPTIONS: Array<{
  id: AlarmSoundType
  name: string
  desc: string
  icon: string
}> = [
  {
    id: 'voice',
    name: 'Suara Vokal Khas',
    desc: 'Audio rekaman "Jangan lupa isi monev!"',
    icon: 'record_voice_over'
  },
  {
    id: 'chime',
    name: 'Melodi Lonceng (Chime)',
    desc: 'Harmoni nada lonceng lembut dan ramah',
    icon: 'notifications_active'
  },
  {
    id: 'bell',
    name: 'Alarm Tegas (Bell)',
    desc: 'Nada dering alarm tegas dan nyaring',
    icon: 'alarm'
  },
  {
    id: 'system',
    name: 'Alarm Sistem HP',
    desc: 'Mengikuti nada alarm default Android',
    icon: 'smartphone'
  },
  {
    id: 'silent',
    name: 'Senyap (Hanya Getar)',
    desc: 'Tanpa suara, hanya getaran & visual notifikasi',
    icon: 'volume_off'
  }
]

function applyPreset(text: string) {
  message.value = text
}

function handlePreviewSound(type: AlarmSoundType) {
  playingSound.value = type
  previewAlarmSound(type)
  setTimeout(() => {
    if (playingSound.value === type) {
      playingSound.value = null
    }
  }, 2200)
}

function handleReset() {
  emit('reset', props.alarm.id)
  emit('close')
}

function handleSave() {
  const cleanTitle = title.value.trim()
  const cleanMessage = message.value.trim()

  emit('save', {
    customTitle: cleanTitle || undefined,
    title: cleanTitle || props.alarm.title,
    customMessage: cleanMessage || undefined,
    soundType: soundType.value,
    vibrate: vibrate.value
  })
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-sm animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-labelledby="custom-notif-title"
  >
    <div
      class="bg-surface-container-high rounded-3xl max-w-lg w-full shadow-2xl border border-outline-variant/30 overflow-hidden flex flex-col max-h-[90vh]"
    >
      <!-- Modal Header -->
      <div class="px-6 pt-5 pb-4 border-b border-outline-variant/20 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-2xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0"
          >
            <span class="material-symbols-outlined text-[24px]">tune</span>
          </div>
          <div>
            <h2 id="custom-notif-title" class="font-title-lg text-title-lg text-on-surface">
              Kustom Notifikasi
            </h2>
            <p class="font-body-xs text-body-xs text-on-surface-variant">
              Alarm {{ alarm.time }} • {{ alarm.kind === 'primary' ? 'Alarm Utama' : 'Snooze' }}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="text-on-surface-variant hover:text-on-surface p-1 rounded-full transition-colors"
          aria-label="Tutup"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>

      <!-- Form Body -->
      <div class="p-6 overflow-y-auto space-y-5 flex-1 text-on-surface">
        <!-- Judul Notifikasi -->
        <div class="space-y-1.5">
          <label for="notif-title" class="font-label-lg text-label-lg text-on-surface flex items-center justify-between">
            <span>Judul Notifikasi</span>
            <span class="font-body-xs text-body-xs text-on-surface-variant">{{ title.length }}/50</span>
          </label>
          <input
            id="notif-title"
            v-model="title"
            type="text"
            maxlength="50"
            placeholder="Judul saat notifikasi muncul..."
            class="w-full bg-surface-container-low rounded-xl px-3.5 py-2.5 font-body-md text-body-md text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-secondary/50 placeholder:text-outline"
          />
        </div>

        <!-- Template Cepat Pesan -->
        <div class="space-y-1.5">
          <label class="font-label-md text-label-md text-on-surface-variant">
            Pilih Cepat Contoh Pesan:
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="preset in PRESET_TEMPLATES"
              :key="preset.label"
              type="button"
              class="px-2.5 py-1.5 rounded-lg border text-left text-xs font-medium flex items-center gap-1.5 transition-colors"
              :class="
                message === preset.text
                  ? 'bg-secondary-container text-on-secondary-container border-secondary/40 font-semibold'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-variant/40'
              "
              @click="applyPreset(preset.text)"
            >
              <span class="material-symbols-outlined text-[15px] shrink-0">{{ preset.icon }}</span>
              <span class="truncate">{{ preset.label }}</span>
            </button>
          </div>
        </div>

        <!-- Isi Pesan Notifikasi -->
        <div class="space-y-1.5">
          <label for="notif-body" class="font-label-lg text-label-lg text-on-surface flex items-center justify-between">
            <span>Isi Teks Notifikasi</span>
            <span class="font-body-xs text-body-xs text-on-surface-variant">{{ message.length }}/150</span>
          </label>
          <textarea
            id="notif-body"
            v-model="message"
            rows="3"
            maxlength="150"
            placeholder="Tulis pesan pengingat yang akan muncul..."
            class="w-full bg-surface-container-low rounded-xl p-3 font-body-sm text-body-sm text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-secondary/50 placeholder:text-outline resize-none leading-relaxed"
          />
        </div>

        <!-- Pilihan Nada Dering & Suara -->
        <div class="space-y-2">
          <label class="font-label-lg text-label-lg text-on-surface">
            Pilihan Nada &amp; Suara Alarm
          </label>
          <div class="space-y-2">
            <div
              v-for="snd in SOUND_OPTIONS"
              :key="snd.id"
              class="flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer"
              :class="
                soundType === snd.id
                  ? 'bg-primary/5 border-primary/40 shadow-sm'
                  : 'bg-surface-container-low border-outline-variant/20 hover:border-outline-variant/50'
              "
              @click="soundType = snd.id"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  :class="
                    soundType === snd.id
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-highest text-on-surface-variant'
                  "
                >
                  <span class="material-symbols-outlined text-[18px]">
                    {{ snd.icon }}
                  </span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="font-label-md text-label-md text-on-surface font-semibold truncate">
                    {{ snd.name }}
                  </p>
                  <p class="font-body-xs text-body-xs text-on-surface-variant truncate">
                    {{ snd.desc }}
                  </p>
                </div>
              </div>

              <!-- Tombol Uji Dengar -->
              <button
                v-if="snd.id !== 'silent'"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ml-2"
                :class="
                  playingSound === snd.id
                    ? 'bg-secondary text-on-secondary animate-pulse'
                    : 'bg-surface-container-highest text-on-surface hover:bg-surface-variant/80'
                "
                title="Dengarkan Contoh Suara"
                @click.stop="handlePreviewSound(snd.id)"
              >
                <span class="material-symbols-outlined text-[15px]">
                  {{ playingSound === snd.id ? 'graphic_eq' : 'play_arrow' }}
                </span>
                <span>{{ playingSound === snd.id ? 'Memutar...' : 'Tes' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Getaran Perangkat Switch -->
        <div class="flex items-center justify-between p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-secondary text-[22px]">
              vibration
            </span>
            <div>
              <p class="font-label-md text-label-md text-on-surface font-semibold">
                Getaran Perangkat
              </p>
              <p class="font-body-xs text-body-xs text-on-surface-variant">
                Getarkan HP saat alarm berbunyi
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            :aria-checked="vibrate"
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
            :class="vibrate ? 'bg-secondary' : 'bg-outline-variant'"
            @click="vibrate = !vibrate"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow transition mt-0.5 ml-0.5"
              :class="vibrate ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </div>

      <!-- Modal Actions -->
      <div
        class="px-6 py-4 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between gap-3"
      >
        <button
          type="button"
          class="text-xs font-medium text-error hover:underline flex items-center gap-1 p-1"
          @click="handleReset"
        >
          <span class="material-symbols-outlined text-[15px]">restart_alt</span>
          <span>Reset Default</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/40 transition-colors"
            @click="emit('close')"
          >
            Batal
          </button>
          <button
            type="button"
            class="px-5 py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary hover:bg-primary/90 flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            @click="handleSave"
          >
            <span class="material-symbols-outlined text-[17px]">save</span>
            <span>Simpan</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
