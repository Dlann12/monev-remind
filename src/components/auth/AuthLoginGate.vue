<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { isNativePlatform } from '@/services/capacitorBridge'
import { isBrowserExtension } from '@/services/monevPortalService'
import type { InternProfile } from '@/types/app'

interface Props {
  profile: InternProfile
  isSyncing: boolean
  isSessionExpired: boolean
}

interface Emits {
  loginWithPortal: []
  syncExistingSession: []
  connectWithToken: [token: string]
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const tokenInput = shallowRef('')
const copiedSnippet = shallowRef(false)
const isNative = computed(() => isNativePlatform())
const isExtension = computed(() => isBrowserExtension())
const isDetectingTab = shallowRef(false)
const detectError = shallowRef('')
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

async function autoDetectExtensionSession() {
  detectError.value = ''
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    detectError.value = 'Fitur deteksi otomatis memerlukan ekstensi browser.'
    return
  }

  isDetectingTab.value = true
  try {
    const tabs = await chrome.tabs.query({ url: '*://monev.maganghub.kemnaker.go.id/*' })
    if (!tabs || tabs.length === 0) {
      detectError.value = 'Tab MagangHub belum dibuka. Klik "Buka Portal Monev" terlebih dahulu.'
      return
    }

    let foundToken = ''
    for (const tab of tabs) {
      if (!tab.id) continue
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            return (
              sessionStorage.getItem('monev_access_token') ||
              localStorage.getItem('monev_access_token') ||
              ''
            )
          }
        })
        const t = results?.[0]?.result
        if (t && typeof t === 'string' && t.trim()) {
          foundToken = t.trim()
          break
        }
      } catch {
        // Tab might still be loading or restricted
      }
    }

    if (foundToken) {
      tokenInput.value = foundToken
      emit('connectWithToken', foundToken)
    } else {
      detectError.value = 'Token belum ditemukan di tab MagangHub. Pastikan Anda sudah login di portal.'
    }
  } catch (err) {
    detectError.value = 'Gagal membaca tab: ' + (err instanceof Error ? err.message : String(err))
  } finally {
    isDetectingTab.value = false
  }
}

onMounted(() => {
  if (isExtension.value) {
    autoDetectExtensionSession()
  }
})

function submitToken() {
  if (!tokenInput.value.trim()) return
  emit('connectWithToken', tokenInput.value)
}
</script>

<template>
  <div
    class="min-h-screen flex flex-col justify-between bg-surface px-margin pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] max-w-lg mx-auto w-full"
  >
    <div class="space-y-space-md">
      <!-- Brand Header -->
      <div class="flex items-center gap-space-sm pt-2">
        <img
          :src="'./app-logo.png'"
          alt="Logo MagangHub"
          class="h-10 w-10 rounded-xl shadow-sm object-cover flex-shrink-0"
        />
        <div>
          <div class="flex items-center gap-1.5">
            <span class="font-headline-sm text-headline-sm text-primary">
              MagangHub
            </span>
            <span
              class="bg-secondary/10 text-secondary font-label-sm text-label-sm px-2 py-0.5 rounded-full uppercase tracking-wider"
            >
              Kemnaker RI
            </span>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Auto-Reminder Pengisian Monev Harian
          </p>
        </div>
      </div>

      <!-- Session Expired Alert (FR-04) -->
      <div
        v-if="isSessionExpired"
        class="bg-error-container text-on-error-container rounded-xl p-3.5 flex items-start gap-2.5 shadow-sm"
      >
        <span class="material-symbols-outlined text-[20px] mt-0.5 flex-shrink-0">
          lock_clock
        </span>
        <div>
          <p class="font-label-lg text-label-lg">Sesi MagangHub Habis</p>
          <p class="font-body-sm text-body-sm opacity-90 mt-0.5">
            Sesi login Anda berakhir. Silakan masuk kembali untuk menyinkronkan profil dan status Monev hari ini.
          </p>
        </div>
      </div>

      <!-- Main Login Gate Card -->
      <div
        class="relative overflow-hidden bg-primary-container text-on-primary rounded-xl p-space-lg shadow-md space-y-space-md"
      >
        <div
          class="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-secondary/20 pointer-events-none blur-2xl"
        />
        <div class="relative z-10 space-y-3">
          <div class="inline-flex items-center gap-1.5 bg-secondary/30 text-secondary-fixed px-2.5 py-1 rounded-full font-label-sm text-label-sm uppercase tracking-wider">
            <span class="material-symbols-outlined text-[15px]">verified_user</span>
            <span>Wajib Login Portal Monev</span>
          </div>

          <h1 class="font-headline-md text-headline-md text-on-primary">
            Masuk dengan Akun Monev MagangHub
          </h1>

          <p class="font-body-sm text-body-sm text-on-primary-container leading-relaxed">
            Aplikasi ini terhubung langsung ke <strong class="text-on-primary">monev.maganghub.kemnaker.go.id</strong> untuk mengambil profil peserta Anda dan mengecek otomatis apakah absen Monev hari ini sudah diisi sebelum alarm pukul 17:00 berbunyi.
          </p>

          <div class="pt-1 space-y-2">
            <button
              type="button"
              class="w-full bg-secondary text-on-secondary py-3.5 px-4 rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-transform"
              :disabled="isSyncing"
              @click="emit('loginWithPortal')"
            >
              <span class="material-symbols-outlined text-[20px]">login</span>
              <span>
                {{
                  isNative
                    ? 'Masuk Lewat Portal Monev Kemnaker'
                    : '1. Buka Portal Monev (Login SIAPkerja)'
                }}
              </span>
            </button>

            <button
              v-if="isNative"
              type="button"
              class="w-full bg-surface-container-lowest/15 hover:bg-surface-container-lowest/25 text-on-primary py-2.5 px-4 rounded-xl font-label-md text-label-md flex items-center justify-center gap-1.5"
              :disabled="isSyncing"
              @click="emit('syncExistingSession')"
            >
              <span
                class="material-symbols-outlined text-[17px]"
                :class="{ 'animate-spin': isSyncing }"
              >
                sync
              </span>
              <span>{{ isSyncing ? 'Memeriksa Sesi...' : 'Cek Ulang Sesi Tersimpan' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Laptop Browser / Extension Token Flow -->
      <div
        v-if="!isNative"
        class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-title-md text-title-md text-on-surface">
            {{ isExtension ? '2. Hubungkan Sesi Ekstensi' : '2. Sinkronisasi Sesi di Browser Laptop' }}
          </h2>
          <button
            type="button"
            class="text-secondary font-label-sm text-label-sm hover:underline flex-shrink-0"
            @click="copySnippet"
          >
            {{ copiedSnippet ? 'Disalin!' : 'Salin Perintah' }}
          </button>
        </div>

        <!-- Extension Auto-Detection Option -->
        <div v-if="isExtension" class="space-y-2 pb-1">
          <button
            type="button"
            class="w-full bg-secondary text-on-secondary py-2.5 px-3 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all"
            :disabled="isDetectingTab || isSyncing"
            @click="autoDetectExtensionSession"
          >
            <span
              class="material-symbols-outlined text-[18px]"
              :class="{ 'animate-spin': isDetectingTab }"
            >
              {{ isDetectingTab ? 'sync' : 'auto_detect_voice' }}
            </span>
            <span>{{ isDetectingTab ? 'Mendeteksi Tab MagangHub...' : 'Deteksi Sesi Otomatis dari Tab' }}</span>
          </button>

          <p v-if="detectError" class="font-body-sm text-[12px] text-error bg-error-container/20 rounded-lg p-2">
            {{ detectError }}
          </p>

          <div class="flex items-center gap-2 pt-1">
            <div class="h-px bg-outline-variant/30 flex-1"></div>
            <span class="font-label-sm text-[11px] text-outline uppercase tracking-wider">Atau Tempel Manual</span>
            <div class="h-px bg-outline-variant/30 flex-1"></div>
          </div>
        </div>

        <p class="font-body-sm text-body-sm text-on-surface-variant">
          Setelah login di tab <code>monev.maganghub.kemnaker.go.id</code>, salin token sesi lewat DevTools Console (khusus pratinjau browser laptop):
          <code class="block bg-surface-container-low rounded-lg px-2.5 py-1.5 mt-1.5 text-[11px] text-primary break-all">
            {{ snippet }}
          </code>
        </p>

        <form class="space-y-2.5" @submit.prevent="submitToken">
          <input
            v-model="tokenInput"
            type="password"
            required
            placeholder="Tempel monev_access_token di sini..."
            class="w-full bg-surface-container-low rounded-xl px-3 py-2.5 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/40"
          />

          <button
            type="submit"
            class="w-full bg-primary text-on-primary py-3 px-4 rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2"
            :disabled="isSyncing"
          >
            <span
              class="material-symbols-outlined text-[18px]"
              :class="{ 'animate-spin': isSyncing }"
            >
              {{ isSyncing ? 'sync' : 'verified_user' }}
            </span>
            <span>{{ isSyncing ? 'Memverifikasi Akun...' : 'Masuk & Buka Aplikasi' }}</span>
          </button>
        </form>

        <p
          v-if="profile.lastPortalSyncAt && profile.portalSyncState !== 'connected'"
          class="font-body-sm text-body-sm text-error"
        >
          {{ profile.lastPortalSyncNote }}
        </p>
      </div>
    </div>

    <!-- Privacy Guarantee -->
    <div class="pt-6 text-center space-y-1">
      <p class="font-label-sm text-label-sm text-on-surface-variant">
        Privasi Terjaga • Tidak Pernah Menyimpan Password Kemnaker
      </p>
      <p class="font-body-sm text-[11px] text-outline">
        Sesi &amp; jadwal pengingat disimpan aman secara lokal di perangkat Anda.
      </p>
    </div>
  </div>
</template>
