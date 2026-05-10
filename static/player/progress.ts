import { state } from './state'
import { displayTimeFromAbsolute } from './timeline'

const buildPayload = (episode: number, seconds: number) => JSON.stringify({
  mal_id: state.malID,
  episode,
  time_seconds: seconds,
})

const sendBeacon = (payload: string) => {
  if (!navigator.sendBeacon) return false
  navigator.sendBeacon('/api/watch-progress', new Blob([payload], { type: 'application/json' }))
  return true
}

export const saveProgress = async (): Promise<void> => {
  if (!state.malID || state.video.currentTime < 1) return
  const episode = Number.parseInt(state.currentEpisode, 10)
  if (!episode) return

  const safeTime = displayTimeFromAbsolute(state.video.currentTime)
  if (state.lastSavedProgress.episode === state.currentEpisode &&
      Math.abs(state.lastSavedProgress.seconds - safeTime) < 5) return

  const payload = buildPayload(episode, safeTime)
  try {
    const res = await fetch('/api/watch-progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
    if (!res.ok) return
    state.lastSavedProgress = { episode: state.currentEpisode, seconds: safeTime }
  } catch {}
}

const scheduleProgressSave = (): void => {
  if (state.progressSaveTimer !== undefined) return
  state.progressSaveTimer = window.setTimeout(() => {
    state.progressSaveTimer = undefined
    saveProgress()
  }, 30000)
}

export const markEpisodeTransition = (episodeNumber: number): void => {
  if (!state.malID || !episodeNumber) return
  if (state.progressSaveTimer !== undefined) { window.clearTimeout(state.progressSaveTimer); state.progressSaveTimer = undefined }
  state.transitionEpisode = episodeNumber
  const payload = buildPayload(episodeNumber, 0)
  if (!sendBeacon(payload)) {
    fetch('/api/watch-progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: payload }).catch(() => {})
  }
}

export const setupProgress = (): void => {
  state.video.addEventListener('timeupdate', () => {
    scheduleProgressSave()
  })

  state.video.addEventListener('pause', () => {
    window.clearTimeout(state.progressSaveTimer)
    state.progressSaveTimer = undefined
    saveProgress()
  })

  window.addEventListener('mouseup', () => { state.isScrubbing = false; saveProgress() })

  window.addEventListener('beforeunload', () => {
    if (state.transitionEpisode !== null || state.completionSent || !state.malID) return
    const episode = Number.parseInt(state.currentEpisode, 10)
    if (!episode) return
    sendBeacon(buildPayload(episode, displayTimeFromAbsolute(state.video.currentTime)))
  })
}
