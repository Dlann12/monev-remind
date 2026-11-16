<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { isNativePlatform } from '@/services/capacitorBridge'
import type { InternProfile } from '@/types/app'

interface Props {
  profile: InternProfile
  isSyncing: boolean
}

interface Emits {
  close: []
  openPortalInApp: []
  syncNow: []
  connectToken: [token: string]
  disconnect: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const tokenInput = shallowRef(props.profile.portalAccessToken)
const copiedSnippet = shallowRef(false)
const isNative = computed(() => isNativePlatform())

const snippet = `copy(sessionStorage.getItem('monev_access_token'))`

async function copySnippet() {
  try {
    await navigator.clipboard.writeText(snippet)
    copiedSnippet.value = true
    setTimeout(() => {
      copiedSnippet.value = false
    }, 2500)
  } catch {
    copiedSnippet.value = false
  }
}

function submitToken() {
  if (!tokenInput.value.trim()) return
  emit('connectToken', tokenInput.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Koneksi Portal Monev MagangHub"
      @click.self="emit('close')"
    >
      <div
        class="bg-surface-container-lowest w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-space-md pb-safe space-y-4 shadow-xl"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-headline-sm text-headline-sm text-on-surface">
              Koneksi Portal Monev Kemnaker
            </h2>
            <p class="font-body-sm text-body-sm text-on-surface-variant">
              Baca status otomatis dari <code class="text-primary">monev.maganghub.kemnaker.go.id</code>
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup koneksi portal"
            class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant"
            @click="emit('close')"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Live Connection Status Box -->
        <div
          class="rounded-xl p-3 space-y-1.5"
          :class="
            profile.portalSyncState === 'connected'
              ? 'bg-secondary-fixed/40 text-on-secondary-fixed'
              : profile.portalSyncState === 'session_expired'
                ? 'bg-error-container text-on-error-container'
                : 'bg-surface-container-low text-on-surface'
          "
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-label-lg text-label-lg">
              {{
                profile.portalSyncState === 'connected'
                  ? 'Terhubung & Sinkron Otomatis'
                  : profile.portalSyncState === 'session_expired'
                    ? 'Sesi Login Habis (Perlu Login Ulang)'
                    : 'Belum Terhubung ke Portal'
              }}
            </span>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm flex items-center gap-1"
              :disabled="isSyncing"
              @click="emit('syncNow')"
            >
              <span
                class="material-symbols-outlined text-[14px]"
                :class="{ 'animate-spin': isSyncing }"
              >
                sync
              </span>
              <span>{{ isSyncing ? 'Mengecek...' : 'Cek Sekarang' }}</span>
            </button>
          </div>
          <p class="font-body-sm text-body-sm opacity-90">
            {{ profile.lastPortalSyncNote }}
          </p>
        </div>

        <!-- Primary Native Flow (Android APK) -->
        <div class="bg-surface-container-low rounded-xl p-3 space-y-2.5">
          <p class="font-label-md text-label-md text-on-surface font-semibold">
            {{
              isNative
                ? '1. Login Resmi SIAPkerja di Dalam Aplikasi'
                : 'Mode Android APK vs Pratinjau Browser Laptop'
            }}
          </p>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            {{
              isNative
                ? 'Ketuk tombol di bawah untuk login akun Kemnaker langsung di WebView aman. Password tidak pernah disimpan; aplikasi hanya membaca status has_attendance dari sesi aktif Anda.'
                : 'Di APK Android, login langsung lewat In-App WebView agar cookie sesi tersimpan otomatis. Untuk uji koneksi live di pratinjau browser laptop (karena kebijakan CORS browser), tempel Access Token sesi sementara di bawah:'
            }}
          </p>

          <button
            type="button"
            class="w-full bg-secondary text-on-secondary py-3 px-4 rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2"
            @click="emit('openPortalInApp')"
          >
            <span class="material-symbols-outlined text-[20px]">login</span>
            <span>
              {{
                isNative
                  ? 'Login & Buka Portal Monev'
                  : 'Buka Portal Monev di Tab Baru'
              }}
            </span>
          </button>
        </div>

        <!-- Web Preview Token Helper (only needed when testing live API on laptop browser) -->
        <div
          v-if="!isNative"
          class="bg-surface-container-low rounded-xl p-3 space-y-2.5"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-label-md text-label-md text-on-surface font-semibold">
              Uji Koneksi Live di Browser Laptop
            </span>
            <button
              type="button"
              class="text-secondary font-label-sm text-label-sm hover:underline"
              @click="copySnippet"
            >
              {{ copiedSnippet ? 'Perintah Disalin!' : 'Salin Perintah Console' }}
            </button>
          </div>

          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Setelah login di tab <code>monev.maganghub.kemnaker.go.id</code>, jalankan perintah console:
            <code class="block bg-surface-container-lowest rounded px-2 py-1 mt-1 text-[11px] break-all">
              {{ snippet }}
            </code>
          </p>

          <form class="space-y-2" @submit.prevent="submitToken">
            <input
              v-model="tokenInput"
              type="password"
              placeholder="Tempel monev_access_token di sini..."
              class="w-full bg-surface-container-lowest rounded-lg px-3 py-2 font-body-sm text-body-sm text-on-surface focus:outline-none"
            />
            <div class="flex gap-2">
              <button
                type="submit"
                class="flex-1 bg-primary text-on-primary py-2.5 px-3 rounded-xl font-label-md text-label-md"
              >
                Hubungkan &amp; Cek Status
              </button>
              <button
                v-if="profile.portalAccessToken"
                type="button"
                class="px-3 py-2.5 rounded-xl bg-error-container text-on-error-container font-label-md text-label-md"
                @click="emit('disconnect')"
              >
                Putuskan
              </button>
            </div>
          </form>
        </div>

        <button
          v-else-if="profile.portalSyncState !== 'disconnected'"
          type="button"
          class="w-full py-2.5 px-4 rounded-xl bg-error-container text-on-error-container font-label-md text-label-md"
          @click="emit('disconnect')"
        >
          Putuskan Sesi Portal dari Aplikasi
        </button>
      </div>
    </div>
  </Teleport>
</template>

