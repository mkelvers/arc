import { state } from './state'

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const showControls = (): void => {
  state.container.classList.add('show-controls')
  window.clearTimeout(state.playerControlsTimeout)
  state.playerControlsTimeout = window.setTimeout(() => {
    if (!state.isScrubbing && !state.video.paused) {
      state.container.classList.remove('show-controls')
    }
  }, 2000)
}

export const seekBy = (delta: number): void => {
  if (state.video.duration <= 0) return
  state.video.currentTime = Math.max(0, Math.min(state.video.duration, state.video.currentTime + delta))
  showControls()
}

export const togglePlayPause = (): void => {
  if (state.video.paused) {
    state.video.play()
  } else {
    state.video.pause()
  }
}

export const toggleMute = (): void => {
  if (state.video.muted || state.video.volume === 0) {
    const restored = state.lastKnownVolume > 0 ? state.lastKnownVolume : 1
    state.video.muted = false
    state.video.volume = restored
  } else {
    state.lastKnownVolume = state.video.volume > 0 ? state.video.volume : state.lastKnownVolume
    state.video.muted = true
  }
}

export const setVolume = (value: number): void => {
  state.video.volume = Math.max(0, Math.min(1, value))
  state.video.muted = value === 0
  if (value > 0) state.lastKnownVolume = value
}

export const toggleFullscreen = (): void => {
  if (document.fullscreenElement) {
    document.exitFullscreen()
    return
  }
  state.container.requestFullscreen?.()
}

export const syncVolumeUI = (): void => {
  const { volumeRange, volumeUnderline, iconVolume, iconMuted } = getControls()
  const value = state.video.muted ? 0 : Math.round(state.video.volume * 100)
  if (volumeRange) {
    volumeRange.value = String(value)
    volumeRange.style.setProperty('--volume-percent', `${value}%`)
  }
  if (volumeUnderline) volumeUnderline.style.height = `${value}%`
  updateMuteIcons(state.video.muted || state.video.volume === 0)
}

interface Controls {
  playPause: HTMLButtonElement | null
  muteBtn: HTMLButtonElement | null
  volumePanel: HTMLElement | null
  volumeRange: HTMLInputElement | null
  volumeUnderline: HTMLElement | null
  backwardBtn: HTMLButtonElement | null
  forwardBtn: HTMLButtonElement | null
  fullscreenBtn: HTMLButtonElement | null
  iconPlay: SVGElement | null
  iconPause: SVGElement | null
  iconVolume: SVGElement | null
  iconMuted: SVGElement | null
  skipSegmentBtn: HTMLButtonElement | null
  subtitleText: HTMLElement | null
  autoplayBtn: HTMLInputElement | null
}

let controlsCache: Controls | null = null

const getControls = (): Controls => {
  if (controlsCache) return controlsCache
  const c = state.container
  controlsCache = {
    playPause: c.querySelector('[data-play-pause]'),
    muteBtn: c.querySelector('[data-mute]'),
    volumePanel: c.querySelector('[data-volume-panel]'),
    volumeRange: c.querySelector('[data-volume-range]'),
    volumeUnderline: c.querySelector('[data-volume-underline]'),
    backwardBtn: c.querySelector('[data-backward]'),
    forwardBtn: c.querySelector('[data-forward]'),
    fullscreenBtn: c.querySelector('[data-fullscreen]'),
    iconPlay: c.querySelector('[data-icon-play]'),
    iconPause: c.querySelector('[data-icon-pause]'),
    iconVolume: c.querySelector('[data-icon-volume]'),
    iconMuted: c.querySelector('[data-icon-muted]'),
    skipSegmentBtn: c.querySelector('[data-skip]'),
    subtitleText: c.querySelector('[data-subtitle-text]'),
    autoplayBtn: document.querySelector('[data-autoplay]'),
  }
  return controlsCache
}

const updatePlayPauseIcons = (isPlaying: boolean): void => {
  const { iconPlay, iconPause } = getControls()
  iconPlay?.classList.toggle('hidden', isPlaying)
  iconPause?.classList.toggle('hidden', !isPlaying)
}

const updateMuteIcons = (isMuted: boolean): void => {
  const { iconVolume, iconMuted } = getControls()
  iconVolume?.classList.toggle('hidden', isMuted)
  iconMuted?.classList.toggle('hidden', !isMuted)
}

export const setupControls = (): void => {
  const {
    playPause, muteBtn, volumePanel, volumeRange,
    backwardBtn, forwardBtn, fullscreenBtn, skipSegmentBtn,
  } = getControls()

  playPause?.addEventListener('click', () => { togglePlayPause(); showControls() })
  state.video.addEventListener('click', () => { togglePlayPause(); showControls() })

  muteBtn?.addEventListener('click', () => { toggleMute(); showControls() })

  volumeRange?.addEventListener('input', () => {
    const value = Number(volumeRange.value) / 100
    setVolume(value)
    showControls()
  })
  volumeRange?.addEventListener('pointerdown', () => volumePanel?.classList.add('is-dragging'))
  window.addEventListener('pointerup', () => volumePanel?.classList.remove('is-dragging'))

  backwardBtn?.addEventListener('click', () => seekBy(-10))
  forwardBtn?.addEventListener('click', () => seekBy(10))

  fullscreenBtn?.addEventListener('click', () => { toggleFullscreen(); showControls() })

  skipSegmentBtn?.addEventListener('click', () => {
    if (!state.activeSkipSegment) return
    state.video.currentTime = state.activeSkipSegment.end + 0.01
    showControls()
  })

  document.addEventListener('fullscreenchange', () => {
    state.isFullscreen = !!document.fullscreenElement
    state.container.classList.toggle('fullscreen', state.isFullscreen)
    if (state.isFullscreen) showControls()
  })

  state.video.addEventListener('play', () => { updatePlayPauseIcons(true); showControls() })
  state.video.addEventListener('pause', () => { updatePlayPauseIcons(false); showControls() })
  state.video.addEventListener('volumechange', syncVolumeUI)

  state.container.addEventListener('mousemove', showControls)

  updatePlayPauseIcons(false)
  syncVolumeUI()
}
