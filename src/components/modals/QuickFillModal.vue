<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import {
  MONEV_MIN_CHARS,
  normalizeDailyLogDraftForSubmit,
  type LatestDailyLogDraft
} from '@/services/monevPortalService'
import { formatIndonesianDate } from '@/utils/dateTime'
import {
  generateMonevFromShortActivity,
  type MonevActivityCategory
} from '@/utils/monevGenerator'

interface Props {
  initialDraft: LatestDailyLogDraft | null
  todayKey: string
  isSubmitting: boolean
  profileRole?: string
  profileCompany?: string
}

interface Emits {
  close: []
  submit: [draft: LatestDailyLogDraft]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

type QuickFillMode = 'generate' | 'copy'

const mode = shallowRef<QuickFillMode>(
  props.initialDraft ? 'copy' : 'generate'
)

const shortActivity = shallowRef('')
const shortObstacle = shallowRef('')
const selectedCategory = shallowRef<MonevActivityCategory>('auto')
const variantCounter = shallowRef(0)
const hasGenerated = shallowRef(false)
const generatorNotice = shallowRef('')

const activityLog = shallowRef(props.initialDraft?.activity_log ?? '')
const lessonLearned = shallowRef(props.initialDraft?.lesson_learned ?? '')
const obstacles = shallowRef(props.initialDraft?.obstacles ?? '')

const categoryOptions: ReadonlyArray<{
  id: MonevActivityCategory
  label: string
}> = [
  { id: 'auto', label: 'Otomatis' },
  { id: 'coding', label: 'Coding / IT' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'design', label: 'Desain / Konten' },
  { id: 'testing', label: 'Testing / Bugfix' },
  { id: 'data', label: 'Data / Excel' },
  { id: 'docs', label: 'Dokumen / Admin' }
]

const activityLen = computed(() => activityLog.value.trim().length)
const lessonLen = computed(() => lessonLearned.value.trim().length)
const obstaclesLen = computed(() => obstacles.value.trim().length)

const needsPadding = computed(
  () =>
    activityLen.value < MONEV_MIN_CHARS ||
    lessonLen.value < MONEV_MIN_CHARS ||
    obstaclesLen.value < MONEV_MIN_CHARS
)

function switchMode(nextMode: QuickFillMode) {
  mode.value = nextMode
  generatorNotice.value = ''
  if (nextMode === 'copy' && props.initialDraft) {
    activityLog.value = props.initialDraft.activity_log
    lessonLearned.value = props.initialDraft.lesson_learned
    obstacles.value = props.initialDraft.obstacles
  }
}

function handleGenerate(shuffle = false) {
  const input = shortActivity.value.trim()
  if (!input) {
    generatorNotice.value = 'Tulis kegiatan singkat hari ini terlebih dahulu.'
    return
  }
  if (shuffle) {
    variantCounter.value = (variantCounter.value + 1) % 3
  }
  const generated = generateMonevFromShortActivity({
    shortActivity: input,
    shortObstacle: shortObstacle.value.trim(),
    category: selectedCategory.value,
    role: props.profileRole,
    company: props.profileCompany,
    variant: variantCounter.value
  })
  activityLog.value = generated.activity_log
  lessonLearned.value = generated.lesson_learned
  obstacles.value = generated.obstacles
  hasGenerated.value = true
  generatorNotice.value = `Kalimat Monev otomatis dibuat (Variasi #${variantCounter.value + 1}). Silakan tinjau atau langsung kirim.`
}

function handleRestoreYesterday() {
  if (!props.initialDraft) return
  activityLog.value = props.initialDraft.activity_log
  lessonLearned.value = props.initialDraft.lesson_learned
  obstacles.value = props.initialDraft.obstacles
}

function handleAutoPad() {
  const normalized = normalizeDailyLogDraftForSubmit({
    sourceDate: mode.value === 'copy' ? props.initialDraft?.sourceDate ?? '' : '',
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
  if (
    mode.value === 'generate' &&
    !activityLog.value.trim() &&
    shortActivity.value.trim()
  ) {
    handleGenerate(false)
  }
  const normalized = normalizeDailyLogDraftForSubmit({
    sourceDate: mode.value === 'copy' ? props.initialDraft?.sourceDate ?? '' : '',
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
      class="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
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

      <!-- Mode Switcher -->
      <div class="px-5 pt-3.5 pb-1">
        <div class="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-container-low">
          <button
            type="button"
            class="py-2 px-3 rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors"
            :class="
              mode === 'generate'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            "
            @click="switchMode('generate')"
          >
            <span class="material-symbols-outlined text-[17px]">auto_awesome</span>
            <span>Auto-Generate</span>
          </button>
          <button
            type="button"
            class="py-2 px-3 rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors"
            :class="
              mode === 'copy'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            "
            @click="switchMode('copy')"
          >
            <span class="material-symbols-outlined text-[17px]">content_copy</span>
            <span>Salin Kemarin</span>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="p-5 overflow-y-auto space-y-4">
        <!-- MODE 1: AUTO-GENERATE -->
        <div
          v-if="mode === 'generate'"
          class="rounded-2xl bg-surface-container-low p-3.5 space-y-3 border border-outline-variant/30"
        >
          <div>
            <label
              for="qf-short-activity"
              class="font-label-md text-label-md text-on-surface font-semibold block"
            >
              Kegiatan Singkat Hari Ini
            </label>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              Cukup ketik 1 kalimat singkat, aplikasi langsung menyusun 3 paragraf Monev formal (&gt;100 karakter) secara offline.
            </p>
            <textarea
              id="qf-short-activity"
              v-model="shortActivity"
              rows="2"
              placeholder="Contoh: bikin halaman login dan fix bug API dashboard"
              class="mt-2 w-full rounded-xl bg-surface-container-lowest border border-outline-variant/50 p-2.5 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label
              for="qf-short-obstacle"
              class="font-label-sm text-label-sm text-on-surface-variant block mb-1"
            >
              Kendala Singkat (Opsional — kosongkan jika lancar)
            </label>
            <input
              id="qf-short-obstacle"
              v-model="shortObstacle"
              type="text"
              placeholder="Contoh: sempat terkendala error CORS saat integrasi"
              class="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/50 px-3 py-2 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="cat in categoryOptions"
              :key="cat.id"
              type="button"
              class="px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-colors"
              :class="
                selectedCategory === cat.id
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40'
              "
              @click="selectedCategory = cat.id"
            >
              {{ cat.label }}
            </button>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 py-2.5 px-3 rounded-xl bg-secondary text-on-secondary font-label-md text-label-md flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              @click="handleGenerate(false)"
            >
              <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
              <span>Generate Kalimat Monev</span>
            </button>
            <button
              v-if="hasGenerated"
              type="button"
              class="py-2.5 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-primary font-label-md text-label-md flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
              @click="handleGenerate(true)"
            >
              <span class="material-symbols-outlined text-[17px]">shuffle</span>
              <span>Variasi</span>
            </button>
          </div>

          <p
            v-if="generatorNotice"
            class="font-body-sm text-body-sm text-secondary font-medium"
          >
            {{ generatorNotice }}
          </p>
        </div>

        <!-- MODE 2: SALIN KEMARIN -->
        <template v-else>
          <div
            v-if="initialDraft?.sourceDate"
            class="rounded-xl bg-secondary-container/45 text-on-secondary-container px-3.5 py-2.5 text-body-sm flex items-center justify-between gap-2"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-[18px] flex-shrink-0">content_copy</span>
              <span>
                Disalin dari log
                <strong class="font-semibold">{{ formatIndonesianDate(initialDraft.sourceDate) }}</strong>.
              </span>
            </div>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-surface-container-lowest/80 text-primary font-label-sm text-label-sm flex-shrink-0"
              @click="handleRestoreYesterday"
            >
              Muat Ulang
            </button>
          </div>

          <div
            v-else
            class="rounded-xl bg-surface-container-low text-on-surface-variant px-3.5 py-2.5 text-body-sm flex items-center gap-2"
          >
            <span class="material-symbols-outlined text-[18px]">info</span>
            <span>
              Belum ada log kemarin di riwayat. Gunakan tab <strong>Auto-Generate</strong> di atas atau tulis manual di bawah.
            </span>
          </div>
        </template>

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
            placeholder="Hasil generate atau ketik aktivitas magang hari ini..."
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
            placeholder="Hasil generate atau ketik ilmu yang dipelajari hari ini..."
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
            placeholder="Hasil generate atau ketik kendala yang dialami..."
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
          <span>{{ isSubmitting ? 'Mengirim ke Portal...' : 'Submit Monev Sekarang' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
