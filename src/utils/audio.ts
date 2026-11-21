import type { AlarmSoundType } from '@/types/app'

let cachedReminderAudio: HTMLAudioElement | null = null

export function playWebAudioChime(): void {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioCtx) return

  try {
    const ctx = new AudioCtx()
    const notes = [587.33, 783.99, 987.77]
    const startAt = ctx.currentTime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const noteStart = startAt + idx * 0.14

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, noteStart)

      gain.gain.setValueAtTime(0.001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.2, noteStart + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.28)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(noteStart)
      osc.stop(noteStart + 0.3)
    })

    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 1000)
  } catch {
    // Autoplay policy may block before user gesture; fail silently
  }
}

export function playWebAudioBell(): void {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioCtx) return

  try {
    const ctx = new AudioCtx()
    const notes = [659.25, 880.0, 1046.5, 1318.51]
    const startAt = ctx.currentTime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const noteStart = startAt + idx * 0.1

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, noteStart)

      gain.gain.setValueAtTime(0.001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.25, noteStart + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(noteStart)
      osc.stop(noteStart + 0.4)
    })

    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 1000)
  } catch {
    // Fail silently
  }
}

/**
 * Plays the chosen reminder sound ('voice', 'chime', 'bell', 'system', 'silent')
 * and vibrates the device when enabled.
 */
export function playReminderChime(
  soundType: AlarmSoundType = 'voice',
  vibrate: boolean = true
): void {
  if (typeof window === 'undefined') return

  if (vibrate && 'vibrate' in navigator) {
    try {
      navigator.vibrate([180, 90, 220])
    } catch {
      // Ignore vibration rejection on restricted browsers
    }
  }

  if (soundType === 'silent') {
    return
  }

  if (soundType === 'chime') {
    playWebAudioChime()
    return
  }

  if (soundType === 'bell') {
    playWebAudioBell()
    return
  }

  // 'voice' or 'system' default
  if (typeof Audio !== 'undefined') {
    try {
      if (!cachedReminderAudio) {
        cachedReminderAudio = new Audio('./sounds/reminder.mp3')
        cachedReminderAudio.preload = 'auto'
      }
      cachedReminderAudio.currentTime = 0
      cachedReminderAudio.volume = 1
      const playPromise = cachedReminderAudio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          playWebAudioChime()
        })
      }
      return
    } catch {
      // Fallback below
    }
  }

  playWebAudioChime()
}

/**
 * Preview / test an alarm sound immediately for the user.
 */
export function previewAlarmSound(soundType: AlarmSoundType): void {
  playReminderChime(soundType, true)
}
