/**
 * Synthesizes an offline notification chime via Web Audio API so audio alerts
 * work in browser and WebView without external media dependencies.
 */
export function playReminderChime(): void {
  if (typeof window === 'undefined') return

  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([180, 90, 220])
    } catch {
      // Ignore vibration rejection on restricted browsers
    }
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioCtx) return

  try {
    const ctx = new AudioCtx()
    const notes = [587.33, 783.99, 987.77] // D5 -> G5 -> B5 gentle chime
    const startAt = ctx.currentTime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const noteStart = startAt + idx * 0.14

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, noteStart)

      gain.gain.setValueAtTime(0.001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.03)
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

