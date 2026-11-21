<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import AuthLoginGate from '@/components/auth/AuthLoginGate.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import HomeTabView from '@/components/home/HomeTabView.vue'
import ScheduleTabView from '@/components/schedule/ScheduleTabView.vue'
import HistoryTabView from '@/components/history/HistoryTabView.vue'
import AlarmPopupModal from '@/components/modals/AlarmPopupModal.vue'
import NotificationsModal from '@/components/modals/NotificationsModal.vue'
import PortalConnectModal from '@/components/modals/PortalConnectModal.vue'
import ProfileModal from '@/components/modals/ProfileModal.vue'
import QuickFillModal from '@/components/modals/QuickFillModal.vue'
import UpdatePromptModal from '@/components/modals/UpdatePromptModal.vue'
import CustomNotificationModal from '@/components/modals/CustomNotificationModal.vue'
import { useMagangStore } from '@/composables/useMagangStore'
import { useReminderEngine } from '@/composables/useReminderEngine'
import { checkForAppUpdate, type AppUpdateInfo } from '@/services/updateService'
import type { LatestDailyLogDraft } from '@/services/monevPortalService'
import type { AlarmRule, AppTab } from '@/types/app'

const store = useMagangStore()
const reminder = useReminderEngine()

const activeTab = shallowRef<AppTab>('beranda')
const isNotificationsOpen = shallowRef(false)
const isProfileOpen = shallowRef(false)
const isConnectPortalOpen = shallowRef(false)
const isQuickFillOpen = shallowRef(false)
const availableUpdate = shallowRef<AppUpdateInfo | null>(null)
const selectedAlarmForCustomization = shallowRef<AlarmRule | null>(null)
const toastMessage = shallowRef('')

function showToast(msg: string) {
  toastMessage.value = msg
  setTimeout(() => {
    if (toastMessage.value === msg) toastMessage.value = ''
  }, 3500)
}

async function handleSaveCustomAlarm(payload: Partial<AlarmRule>) {
  if (!selectedAlarmForCustomization.value) return
  await store.updateAlarmRule(selectedAlarmForCustomization.value.id, payload)
  selectedAlarmForCustomization.value = null
  showToast('Pengaturan notifikasi berhasil disimpan.')
}

async function handleResetCustomAlarm(alarmId: string) {
  await store.resetAlarmRule(alarmId)
  selectedAlarmForCustomization.value = null
  showToast('Notifikasi dikembalikan ke pengaturan awal.')
}

async function handleCheckForUpdate(manual = false) {
  try {
    const info = await checkForAppUpdate()
    if (info.hasUpdate) {
      availableUpdate.value = info
    } else if (manual) {
      showToast(`Aplikasi sudah versi terbaru (v${info.currentVersion}).`)
    }
  } catch {
    if (manual) {
      showToast('Gagal memeriksa pembaruan saat ini.')
    }
  }
}

onMounted(() => {
  // Check for app update in the background when app loads
  handleCheckForUpdate(false)
})

async function handleSyncNow() {
  const res = await store.syncPortalStatus()
  if (res.outcome === 'filled' || res.outcome === 'off_day') {
    reminder.dismissAlert()
  }
  showToast(res.note)
}

async function handleLoginPortal() {
  await store.openPortalForLogin((res) => {
    showToast(res.note)
  })
}

async function handleOpenPortal() {
  reminder.dismissAlert()
  await store.openPortalAndSync((res) => {
    showToast(res.note)
  })
}

async function handleConnectToken(token: string) {
  const res = await store.connectWithAccessToken(token)
  showToast(res.note)
  if (res.outcome === 'filled' || res.outcome === 'unfilled' || res.outcome === 'off_day') {
    isConnectPortalOpen.value = false
  }
}

async function handleDisconnectPortal() {
  await store.disconnectPortal()
  isConnectPortalOpen.value = false
  isProfileOpen.value = false
  activeTab.value = 'beranda'
  showToast('Berhasil keluar dari sesi MagangHub.')
}

async function handleQuickFillSubmit(draft: LatestDailyLogDraft) {
  const res = await store.submitCustomMonevToday(draft)
  showToast(res.message)
  if (res.outcome === 'submitted' || res.outcome === 'already_filled') {
    reminder.dismissAlert()
    isQuickFillOpen.value = false
  }
}

async function handleTestAlarm() {
  const res = await store.triggerTestReminder()
  reminder.showAlertBanner({
    title: res.title,
    body: res.body,
    isSessionWarning: store.isSessionExpired.value
  })
  if (res.telegramResult && !res.telegramResult.ok) {
    showToast(`Alarm lokal berbunyi. Telegram: ${res.telegramResult.error}`)
    return
  }
  showToast('Alarm pengingat Monev dipicu!')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-surface text-on-surface w-full">
    <div
      v-if="store.isLoading.value"
      class="flex-1 flex items-center justify-center px-margin text-center text-on-surface-variant font-body-md text-body-md"
    >
      Memuat sesi Monev MagangHub...
    </div>

    <!-- Mandatory Login Gate before accessing app -->
    <AuthLoginGate
      v-else-if="!store.isAuthenticated.value"
      :profile="store.profile.value"
      :is-syncing="store.isSyncingPortal.value"
      :is-session-expired="store.isSessionExpired.value"
      @login-with-portal="handleLoginPortal"
      @sync-existing-session="handleSyncNow"
      @connect-with-token="handleConnectToken"
    />

    <!-- Authenticated App Shell -->
    <template v-else>
      <AppHeader
        :active-tab="activeTab"
        :unread-count="store.unreadNotificationsCount.value"
        :portal-sync-state="store.profile.value.portalSyncState"
        :is-session-expired="store.isSessionExpired.value"
        :photo-url="store.profile.value.photoUrl"
        @open-notifications="isNotificationsOpen = true"
        @open-profile="isProfileOpen = true"
      />

      <main class="flex-1 flex flex-col relative w-full max-w-lg mx-auto pt-4 pb-6">
        <HomeTabView
          v-if="activeTab === 'beranda'"
          :profile="store.profile.value"
          :schedule="store.schedule.value"
          :alarms="store.alarms.value"
          :active-alarms-count="store.activeAlarmsCount.value"
          :today-key="store.todayKey.value"
          :today-record="store.todayRecord.value"
          :national-holiday-name="store.nationalHolidayToday.value"
          :is-catch-up-needed="store.isCatchUpNeeded.value"
          :is-session-expired="store.isSessionExpired.value"
          :is-syncing-portal="store.isSyncingPortal.value"
          :status-meta="reminder.statusMeta.value"
          :countdown-text="reminder.countdownText.value"
          :compliance-stats="store.complianceStats.value"
          @toggle-holiday="store.toggleHolidayToday()"
          @toggle-alarm="store.toggleAlarm($event)"
          @test-alarm="handleTestAlarm"
          @open-portal="handleOpenPortal"
          @sync-now="handleSyncNow"
          @open-connect-modal="isConnectPortalOpen = true"
          @open-quick-fill="isQuickFillOpen = true"
          @navigate-tab="activeTab = $event"
        />

        <ScheduleTabView
          v-else-if="activeTab === 'jadwal-alarm'"
          :schedule="store.schedule.value"
          :alarms="store.alarms.value"
          :profile="store.profile.value"
          :is-holiday-today="
            store.todayRecord.value.isHolidayOverride ||
            store.todayRecord.value.status === 'libur'
          "
          :national-holiday-name="store.nationalHolidayToday.value"
          @update-schedule="store.updateSchedule($event)"
          @toggle-alarm="store.toggleAlarm($event)"
          @update-alarm-time="(id, time) => store.updateAlarmTime(id, time)"
          @customize-alarm="selectedAlarmForCustomization = $event"
          @toggle-holiday-today="store.toggleHolidayToday()"
          @test-alarm="handleTestAlarm"
          @update-profile="store.updateProfile($event)"
          @check-update="handleCheckForUpdate(true)"
        />

        <HistoryTabView
          v-else-if="activeTab === 'riwayat'"
          :records="store.records.value"
          :is-syncing="store.isSyncingPortal.value"
          :auto-fill-time="store.schedule.value.autoFillTime"
          :compliance-stats="store.complianceStats.value"
          @sync-now="handleSyncNow"
        />
      </main>

      <BottomNav :active-tab="activeTab" @change-tab="activeTab = $event" />

      <AlarmPopupModal
        v-if="reminder.activeAlert.value"
        :alert="reminder.activeAlert.value"
        :is-syncing="store.isSyncingPortal.value"
        @dismiss="reminder.dismissAlert()"
        @sync-now="handleSyncNow"
        @open-portal="handleOpenPortal"
      />

      <PortalConnectModal
        v-if="isConnectPortalOpen"
        :profile="store.profile.value"
        :is-syncing="store.isSyncingPortal.value"
        @close="isConnectPortalOpen = false"
        @open-portal-in-app="handleOpenPortal"
        @sync-now="handleSyncNow"
        @connect-token="handleConnectToken"
        @disconnect="handleDisconnectPortal"
      />

      <NotificationsModal
        v-if="isNotificationsOpen"
        :notifications="store.notifications.value"
        @close="isNotificationsOpen = false"
        @mark-all-read="store.markAllNotificationsRead()"
      />

      <ProfileModal
        v-if="isProfileOpen"
        :profile="store.profile.value"
        :is-session-expired="store.isSessionExpired.value"
        :is-syncing="store.isSyncingPortal.value"
        @close="isProfileOpen = false"
        @sync-now="handleSyncNow"
        @open-connect-modal="
          () => {
            isProfileOpen = false
            isConnectPortalOpen = true
          }
        "
        @disconnect="handleDisconnectPortal"
      />

      <QuickFillModal
        v-if="isQuickFillOpen"
        :initial-draft="store.latestLogDraft.value"
        :today-key="store.todayKey.value"
        :is-submitting="store.isAutoFilling.value"
        :profile-role="store.profile.value.role"
        :profile-company="store.profile.value.company"
        @close="isQuickFillOpen = false"
        @submit="handleQuickFillSubmit"
      />

      <!-- In-App Auto-Update Modal -->
      <UpdatePromptModal
        v-if="availableUpdate"
        :update-info="availableUpdate"
        @close="availableUpdate = null"
        @toast="showToast"
      />

      <!-- Custom Notification & Sound Modal -->
      <CustomNotificationModal
        v-if="selectedAlarmForCustomization"
        :alarm="selectedAlarmForCustomization"
        @close="selectedAlarmForCustomization = null"
        @save="handleSaveCustomAlarm"
        @reset="handleResetCustomAlarm"
      />
    </template>

    <!-- Floating Toast Feedback -->
    <div
      v-if="toastMessage"
      role="status"
      class="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 -translate-x-1/2 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-full shadow-lg font-label-md text-label-md max-w-[90vw] text-center"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>
