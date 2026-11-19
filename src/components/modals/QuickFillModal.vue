<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import {
  MONEV_MIN_CHARS,
  normalizeDailyLogDraftForSubmit,
  type LatestDailyLogDraft
} from '@/services/monevPortalService'
import { formatIndonesianDate } from '@/utils/dateTime'

interface Props {
  initialDraft: LatestDailyLogDraft | null
  todayKey: string
  isSubmitting: boolean
}

interface Emits {
  close: []
  submit: [draft: LatestDailyLogDraft]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const activityLog = shallowRef(props.initialDraft?.activity_log ?? '')
const lessonLearned = shallowRef(props.initialDraft?.lesson_learned ?? '')
const obstacles = shallowRef(props.initialDraft?.obstacles ?? '')

const activityLen = computed(() => activityLog.value.trim().length)
const lessonLen = computed(() => lessonLearned.value.trim().length)
const obstaclesLen = computed(() => obstacles.value.trim().length)

const needsPadding = computed(
  () =>
    activityLen.value < MONEV_MIN_CHARS ||
    lessonLen.value < MONEV_MIN_CHARS ||
    obstaclesLen.value < MONEV_MIN_CHARS
)

function handleAutoPad() {
  const normalized = normalizeDailyLogDraftForSubmit({
    sourceDate: props.initialDraft?.sourceDate ?? '',
    activity_log: activityLog.value,
    lesson_learned: lessonLearned.value,
    obstacles: obstacles.value
  })
  activityLog.value = normalized.activity_log
  lessonLearned.value = normalized.lesson_learned
  obstacles.value = normalized.obstacles
}

function handleSubmit() {
  if (props.isSubmitting) return
  const normalized = normalizeDailyLogDraftForSubmit({
    sourceDate: props.initialDraft?.sourceDate ?? '',
    activity_log: activityLog.value,
    lesson_learned: lessonLearned.value,
    obstacles: obstacles.value
  })
  emit('submit', normalized)
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-on-surface/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    @click.self="!isSubmitting && emit('close')"
  >
    <div
      class="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="px-5 pt-5 pb-3 border-b border-outline-variant/30 flex items-start justify-between gap-3">
        <div>
          <h2 class="font-title-lg text-title-lg text-on-surface">
            Isi Cepat Monev Harian
          </h2>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            {{ formatIndonesianDate(todayKey) }}
          </p>
        </div>
        <button
          type="button"
          class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant"
          :disabled="isSubmitting"
          aria-label="Tutup modal isi cepat"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 overflow-y-auto space-y-4">
        <div
          v-if="initialDraft?.sourceDate"
          class="rounded-xl bg-secondary-container/45 text-on-secondary-container px-3.5 py-2.5 text-body-sm flex items-center gap-2"
        >
          <span class="material-symbols-outlined text-[18px]">content_copy</span>
          <span>
            Otomatis disalin dari log tanggal
            <strong class="font-semibold">{{ formatIndonesianDate(initialDraft.sourceDate) }}</strong>.
            Kamu bisa mengeditnya dulu sebelum dikirim.
          </span>
        </div>

        <div
          v-else
          class="rounded-xl bg-surface-container-low text-on-surface-variant px-3.5 py-2.5 text-body-sm flex items-center gap-2"
        >
          <span class="material-symbols-outlined text-[18px]">edit_note</span>
          <span>
            Belum ada log sebelumnya di riwayat. Tulis kegiatan hari ini atau gunakan tombol Auto-Lengkapi 100 karakter.
          </span>
        </div>

        <!-- Activity Log -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <label for="qf-activity" class="font-label-md text-label-md text-on-surface font-semibold">
              Uraian Kegiatan Hari Ini
            </label>
            <span
              class="font-label-sm text-label-sm px-2 py-0.5 rounded-full"
              :class="
                activityLen >= MONEV_MIN_CHARS
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-error-container text-on-error-container'
              "
            >
              {{ activityLen }} / {{ MONEV_MIN_CHARS }}
            </span>
          </div>
          <textarea
            id="qf-activity"
            v-model="activityLog"
            rows="3"
            placeholder="Tuliskan aktivitas magang yang dikerjakan hari ini..."
            class="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <!-- Lesson Learned -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <label for="qf-lesson" class="font-label-md text-label-md text-on-surface font-semibold">
              Pembelajaran yang Diperoleh
            </label>
            <span
              class="font-label-sm text-label-sm px-2 py-0.5 rounded-full"
              :class="
                lessonLen >= MONEV_MIN_CHARS
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-error-container text-on-error-container'
              "
            >
              {{ lessonLen }} / {{ MONEV_MIN_CHARS }}
            </span>
          </div>
          <textarea
            id="qf-lesson"
            v-model="lessonLearned"
            rows="3"
            placeholder="Tuliskan ilmu atau keterampilan yang dipelajari hari ini..."
            class="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <!-- Obstacles -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <label for="qf-obstacles" class="font-label-md text-label-md text-on-surface font-semibold">
              Kendala &amp; Solusi
            </label>
            <span
              class="font-label-sm text-label-sm px-2 py-0.5 rounded-full"
              :class="
                obstaclesLen >= MONEV_MIN_CHARS
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-error-container text-on-error-container'
              "
            >
              {{ obstaclesLen }} / {{ MONEV_MIN_CHARS }}
            </span>
          </div>
          <textarea
            id="qf-obstacles"
            v-model="obstacles"
            rows="2"
            placeholder="Tuliskan kendala yang dialami (atau tidak ada kendala signifikan)..."
            class="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <button
          v-if="needsPadding"
          type="button"
          class="w-full py-2.5 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-primary font-label-md text-label-md flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          @click="handleAutoPad"
        >
          <span class="material-symbols-outlined text-[18px]">auto_fix_high</span>
          <span>Auto-Lengkapi Minimal 100 Karakter (Syarat Kemnaker)</span>
        </button>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-outline-variant/30 bg-surface-container-lowest flex items-center gap-2.5">
        <button
          type="button"
          class="flex-1 py-3 px-4 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md"
          :disabled="isSubmitting"
          @click="emit('close')"
        >
          Batal
        </button>
        <button
          type="button"
          class="flex-[1.6] py-3 px-4 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          :disabled="isSubmitting"
          @click="handleSubmit"
        >
          <span
            class="material-symbols-outlined text-[18px]"
            :class="{ 'animate-spin': isSubmitting }"
          >
            {{ isSubmitting ? 'sync' : 'send' }}
          </span>
          <span>{{ isSubmitting ? 'Mengirim ke Portal...' : 'Kirim Monev Sekarang' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
