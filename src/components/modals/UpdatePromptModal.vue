<script setup lang="ts">
import { shallowRef } from 'vue'
import type { AppUpdateInfo } from '@/services/updateService'
import { triggerUpdateInstall } from '@/services/updateService'

const props = defineProps<{
  updateInfo: AppUpdateInfo
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toast', message: string): void
}>()

const isInstalling = shallowRef(false)
const errorMessage = shallowRef('')

async function handleUpdateClick() {
  if (isInstalling.value) return
  isInstalling.value = true
  errorMessage.value = ''

  try {
    const result = await triggerUpdateInstall({
      downloadUrl: props.updateInfo.downloadUrl,
      latestVersion: props.updateInfo.latestVersion
    })

    if (result.state === 'install_launched') {
      emit('toast', result.message || 'Membuka penginstalan APK...')
      emit('close')
    } else if (result.state === 'opened_browser') {
      emit('toast', result.message || 'Membuka unduhan di browser...')
      emit('close')
    } else {
      errorMessage.value = result.error || 'Gagal memulai instalasi pembaruan.'
    }
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : 'Terjadi kendala saat memperbarui.'
  } finally {
    isInstalling.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-sm animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-labelledby="update-modal-title"
  >
    <div
      class="bg-surface-container-high rounded-3xl max-w-md w-full shadow-2xl border border-outline-variant/30 overflow-hidden flex flex-col max-h-[85vh]"
    >
      <!-- Modal Header -->
      <div class="px-6 pt-6 pb-4 border-b border-outline-variant/20 flex items-start gap-4">
        <div
          class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
        >
          <span class="material-symbols-outlined text-[28px]">system_update</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 id="update-modal-title" class="font-title-lg text-title-lg text-on-surface">
              Pembaruan Tersedia
            </h2>
            <span
              class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary text-on-primary"
            >
              v{{ updateInfo.latestVersion }}
            </span>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Versi saat ini: <span class="font-mono">v{{ updateInfo.currentVersion }}</span>
          </p>
        </div>
        <button
          type="button"
          class="text-on-surface-variant hover:text-on-surface p-1 rounded-full transition-colors"
          aria-label="Tutup"
          :disabled="isInstalling"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>

      <!-- Release Notes Body -->
      <div class="p-6 overflow-y-auto space-y-4 flex-1">
        <div class="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
          <div class="flex items-center gap-2 mb-2 text-primary font-title-sm text-title-sm">
            <span class="material-symbols-outlined text-[18px]">new_releases</span>
            <span>Apa yang baru di v{{ updateInfo.latestVersion }}?</span>
          </div>
          <div
            v-if="updateInfo.releaseNotes"
            class="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto pr-1"
          >
            {{ updateInfo.releaseNotes }}
          </div>
          <div v-else class="font-body-sm text-body-sm text-on-surface-variant italic">
            Pembaruan performa dan keandalan sistem MagangHub Reminder.
          </div>
        </div>

        <div class="flex items-start gap-3 p-3.5 bg-primary/5 rounded-2xl border border-primary/20">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">
            check_circle
          </span>
          <p class="font-body-xs text-body-xs text-on-surface-variant leading-relaxed">
            <strong class="text-on-surface">Pembaruan Otomatis:</strong> Aplikasi versi lama tidak
            perlu dihapus. Data akun, riwayat Monev, dan jadwal alarm akan tetap aman terjaga.
          </p>
        </div>

        <!-- Error Feedback -->
        <div
          v-if="errorMessage"
          class="p-3 bg-error-container text-on-error-container rounded-xl font-body-sm text-body-sm flex items-center gap-2"
        >
          <span class="material-symbols-outlined text-[18px] shrink-0">error</span>
          <span>{{ errorMessage }}</span>
        </div>
      </div>

      <!-- Modal Actions -->
      <div
        class="px-6 py-4 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-end gap-3"
      >
        <button
          type="button"
          class="px-4 py-2.5 rounded-full font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-variant/40 transition-colors"
          :disabled="isInstalling"
          @click="emit('close')"
        >
          Nanti Saja
        </button>
        <button
          type="button"
          class="px-5 py-2.5 rounded-full font-label-lg text-label-lg bg-primary text-on-primary hover:bg-primary/90 flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-60"
          :disabled="isInstalling"
          @click="handleUpdateClick"
        >
          <span
            v-if="isInstalling"
            class="material-symbols-outlined animate-spin text-[18px]"
          >
            progress_activity
          </span>
          <span v-else class="material-symbols-outlined text-[18px]">download</span>
          <span>{{ isInstalling ? 'Mengunduh APK...' : 'Perbarui Sekarang' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
