import { isNativePlatform } from '@/services/capacitorBridge'
import { MonevSync } from '@/services/monevPortalService'
import { CURRENT_APP_VERSION } from '@/constants/appVersion'

export interface AppUpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  downloadUrl: string
  releaseName: string
  releaseNotes: string
  publishedAt: string
}

export interface UpdateInstallResult {
  state: 'install_launched' | 'opened_browser' | 'error'
  message?: string
  error?: string
}

export const GITHUB_REPO_LATEST_RELEASE_URL =
  'https://api.github.com/repos/Dlann12/monev-remind/releases/latest'

/**
 * Compares two semantic version strings (e.g. '1.3.0' vs '1.2.2').
 * Returns true if remoteVer is strictly newer than currentVer.
 */
export function isNewerVersion(remoteVer: string, currentVer: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const clean = v.replace(/^v/i, '').trim()
    const parts = clean.split('.').map((p) => Number.parseInt(p, 10) || 0)
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }

  const [rMaj, rMin, rPat] = parse(remoteVer)
  const [cMaj, cMin, cPat] = parse(currentVer)

  if (rMaj > cMaj) return true
  if (rMaj < cMaj) return false
  if (rMin > cMin) return true
  if (rMin < cMin) return false
  return rPat > cPat
}

/**
 * Checks GitHub Releases API for newer version of MagangHub Reminder.
 */
export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  const fallbackInfo: AppUpdateInfo = {
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION,
    downloadUrl: '',
    releaseName: '',
    releaseNotes: '',
    publishedAt: ''
  }

  try {
    const res = await fetch(GITHUB_REPO_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json'
      }
    })

    if (!res.ok) {
      return fallbackInfo
    }

    const data = await res.json()
    const tag = (data.tag_name || '').trim()
    const latestVersion = tag.replace(/^v/i, '')

    if (!tag || !latestVersion) {
      return fallbackInfo
    }

    const hasUpdate = isNewerVersion(latestVersion, CURRENT_APP_VERSION)

    let downloadUrl = ''
    if (Array.isArray(data.assets)) {
      const apkAsset = data.assets.find(
        (asset: { name?: string; browser_download_url?: string }) =>
          typeof asset.name === 'string' &&
          asset.name.toLowerCase().endsWith('.apk')
      )
      if (apkAsset?.browser_download_url) {
        downloadUrl = apkAsset.browser_download_url
      }
    }

    if (!downloadUrl) {
      downloadUrl = data.html_url || ''
    }

    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion,
      downloadUrl,
      releaseName: data.name || `MagangHub Reminder v${latestVersion}`,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || ''
    }
  } catch {
    return fallbackInfo
  }
}

/**
 * Initiates APK download and launches Android package installer in-place.
 */
export async function triggerUpdateInstall(
  updateInfo: Pick<AppUpdateInfo, 'downloadUrl' | 'latestVersion'>
): Promise<UpdateInstallResult> {
  const { downloadUrl, latestVersion } = updateInfo

  if (!downloadUrl) {
    return { state: 'error', error: 'URL pembaruan tidak ditemukan.' }
  }

  if (isNativePlatform()) {
    try {
      const res = await MonevSync.downloadAndInstallUpdate({
        url: downloadUrl,
        version: latestVersion
      })

      if (res.state === 'install_launched') {
        return {
          state: 'install_launched',
          message:
            'File APK berhasil diunduh. Dialog penginstalan Android telah dibuka.'
        }
      }

      return {
        state: 'error',
        error: res.error || 'Gagal memulai penginstalan APK Android.'
      }
    } catch (err) {
      return {
        state: 'error',
        error:
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan saat mengunduh APK pembaruan.'
      }
    }
  }

  if (typeof window !== 'undefined' && downloadUrl) {
    window.open(downloadUrl, '_blank')
    return {
      state: 'opened_browser',
      message: 'Membuka tautan unduhan pembaruan di browser.'
    }
  }

  return { state: 'error', error: 'Lingkungan aplikasi tidak didukung.' }
}
