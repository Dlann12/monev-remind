<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { MonevRecord } from '@/types/app'
import { formatIndonesianDate } from '@/utils/dateTime'

interface Props {
  records: ReadonlyArray<MonevRecord>
  isSyncing: boolean
  complianceStats: {
    filled: number
    onLeave: number
    missed: number
    unfilled: number
    holiday: number
    total: number
    percentage: number
  }
}

interface Emits {
  syncNow: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

type HistoryFilter = 'all' | 'terisi' | 'izin' | 'terlewat' | 'belum' | 'libur'
const activeFilter = shallowRef<HistoryFilter>('all')

const filteredRecords = computed(() => {
  return props.records.filter((rec) => {
    if (activeFilter.value === 'all') return true
    return rec.status === activeFilter.value
  })
})

function formatApprovalLabel(
  approval?: string,
  dailyLogState?: string
): string {
  if (dailyLogState === 'NEEDS_REVISION' || approval === 'REJECTED') {
    return 'Perlu Revisi Mentor'
  }
  if (dailyLogState === 'REVISION_SUBMITTED') {
    return 'Revisi Dikirim'
  }
  switch (approval || dailyLogState) {
    case 'APPROVED':
      return 'Disetujui Mentor'
    case 'SUBMITTED':
      return 'Menunggu Validasi'
    case 'REJECTED':
      return 'Ditolak / Revisi'
    default:
      return ''
  }
}

function statusBadgeLabel(status: MonevRecord['status']): string {
  switch (status) {
    case 'terisi':
      return 'Hadir'
    case 'izin':
      return 'Izin'
    case 'libur':
      return 'Libur'
    case 'terlewat':
      return 'Tidak Hadir'
    default:
      return 'Belum Diisi'
  }
}

function statusAccentBarClass(status: MonevRecord['status']): string {
  switch (status) {
    case 'terisi':
      return 'bg-on-tertiary-container'
    case 'izin':
      return 'bg-primary'
    case 'terlewat':
      return 'bg-error'
    case 'libur':
      return 'bg-outline-variant'
    default:
      return 'bg-amber-500'
  }
}

function statusBadgeClass(status: MonevRecord['status']): string {
  switch (status) {
    case 'terisi':
      return 'bg-secondary-fixed/50 text-on-secondary-fixed'
    case 'izin':
      return 'bg-primary-fixed text-on-primary-fixed'
    case 'terlewat':
      return 'bg-error-container text-on-error-container'
    case 'libur':
      return 'bg-surface-container text-on-surface-variant'
    default:
      return 'bg-amber-100 text-amber-900'
  }
}
</script>

<template>
  <div class="flex flex-col w-full px-margin space-y-space-md">
    <!-- Summary Card -->
    <div class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="font-title-md text-title-md text-on-surface">
            Riwayat Kehadiran Monev
          </h2>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Semua status hari magang mengikuti <span class="text-primary font-medium">monev.maganghub.kemnaker.go.id</span>
          </p>
        </div>

        <button
          type="button"
          class="px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-label-sm text-label-sm flex items-center gap-1 flex-shrink-0"
          :disabled="isSyncing"
          @click="emit('syncNow')"
        >
          <span
            class="material-symbols-outlined text-[15px]"
            :class="{ 'animate-spin': isSyncing }"
          >
            sync
          </span>
          <span>{{ isSyncing ? 'Sinkron...' : 'Sinkron' }}</span>
        </button>
      </div>

      <div class="grid grid-cols-5 gap-1.5 text-center pt-1">
        <div class="bg-surface-container-low rounded-lg p-2">
          <span class="block font-title-md text-title-md text-secondary font-bold">
            {{ complianceStats.filled }}
          </span>
          <span class="block font-label-sm text-label-sm text-on-surface-variant">
            Hadir
          </span>
        </div>
        <div class="bg-surface-container-low rounded-lg p-2">
          <span class="block font-title-md text-title-md text-primary font-bold">
            {{ complianceStats.onLeave }}
          </span>
          <span class="block font-label-sm text-label-sm text-on-surface-variant">
            Izin
          </span>
        </div>
        <div class="bg-surface-container-low rounded-lg p-2">
          <span class="block font-title-md text-title-md text-error font-bold">
            {{ complianceStats.missed }}
          </span>
          <span class="block font-label-sm text-label-sm text-on-surface-variant">
            Tdk Hadir
          </span>
        </div>
        <div class="bg-surface-container-low rounded-lg p-2">
          <span class="block font-title-md text-title-md text-amber-700 font-bold">
            {{ complianceStats.unfilled }}
          </span>
          <span class="block font-label-sm text-label-sm text-on-surface-variant">
            Belum
          </span>
        </div>
        <div class="bg-surface-container-low rounded-lg p-2">
          <span class="block font-title-md text-title-md text-on-surface font-bold">
            {{ complianceStats.percentage }}%
          </span>
          <span class="block font-label-sm text-label-sm text-on-surface-variant">
            Patuh
          </span>
        </div>
      </div>
    </div>

    <!-- Filter Chips -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-label-md text-label-md flex-shrink-0"
        :class="
          activeFilter === 'all'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-lowest text-on-surface-variant'
        "
        @click="activeFilter = 'all'"
      >
        Semua ({{ records.length }})
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-label-md text-label-md flex-shrink-0"
        :class="
          activeFilter === 'terisi'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-lowest text-on-surface-variant'
        "
        @click="activeFilter = 'terisi'"
      >
        Hadir ({{ complianceStats.filled }})
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-label-md text-label-md flex-shrink-0"
        :class="
          activeFilter === 'izin'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-lowest text-on-surface-variant'
        "
        @click="activeFilter = 'izin'"
      >
        Izin ({{ complianceStats.onLeave }})
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-label-md text-label-md flex-shrink-0"
        :class="
          activeFilter === 'terlewat'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-lowest text-on-surface-variant'
        "
        @click="activeFilter = 'terlewat'"
      >
        Tidak Hadir ({{ complianceStats.missed }})
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-label-md text-label-md flex-shrink-0"
        :class="
          activeFilter === 'belum'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-lowest text-on-surface-variant'
        "
        @click="activeFilter = 'belum'"
      >
        Belum Diisi ({{ complianceStats.unfilled }})
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-label-md text-label-md flex-shrink-0"
        :class="
          activeFilter === 'libur'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-lowest text-on-surface-variant'
        "
        @click="activeFilter = 'libur'"
      >
        Libur ({{ complianceStats.holiday }})
      </button>
    </div>

    <!-- Records List -->
    <div class="space-y-2">
      <div
        v-for="rec in filteredRecords"
        :key="rec.date"
        class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-start justify-between gap-2 relative overflow-hidden"
      >
        <div
          class="absolute top-0 left-0 w-1 h-full"
          :class="statusAccentBarClass(rec.status)"
        />

        <div class="pl-2 min-w-0 flex-1 space-y-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <p class="font-title-md text-title-md text-on-surface">
              {{ formatIndonesianDate(rec.date) }}
            </p>
            <span
              v-if="rec.isAutoFilled"
              class="px-1.5 py-0.5 rounded bg-secondary-fixed/40 text-on-secondary-fixed font-label-sm text-label-sm"
            >
              Auto 23:00
            </span>
          </div>

          <p class="font-body-sm text-body-sm text-on-surface-variant">
            <template v-if="rec.status === 'terisi'">
              {{
                formatApprovalLabel(rec.approvalStatus, rec.dailyLogState) ||
                'Tercatat hadir di Monev'
              }}
            </template>
            <template v-else-if="rec.status === 'izin'">
              {{
                rec.leaveReason ||
                formatApprovalLabel(rec.approvalStatus, rec.dailyLogState) ||
                'Izin tercatat di Monev'
              }}
            </template>
            <template v-else-if="rec.status === 'terlewat'">
              Tercatat Tidak Hadir (ABSENT) di portal Monev
            </template>
            <template v-else-if="rec.status === 'libur'">
              {{ rec.holidayName || 'Hari libur / di luar jadwal magang' }}
            </template>
            <template v-else>
              Hari kerja belum ada pengisian di portal Monev
            </template>
          </p>

          <p
            v-if="rec.activityLog"
            class="font-body-sm text-body-sm text-on-surface-variant/85 line-clamp-2 bg-surface-container-low rounded-lg px-2.5 py-1.5"
          >
            {{ rec.activityLog }}
          </p>
        </div>

        <span
          class="font-label-sm text-label-sm px-2.5 py-1 rounded-full uppercase flex-shrink-0"
          :class="statusBadgeClass(rec.status)"
        >
          {{ statusBadgeLabel(rec.status) }}
        </span>
      </div>

      <div
        v-if="filteredRecords.length === 0"
        class="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant font-body-sm text-body-sm space-y-2"
      >
        <p>Belum ada riwayat kehadiran dari Monev MagangHub untuk filter ini.</p>
      </div>
    </div>
  </div>
</template>
