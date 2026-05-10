import { SkipSegment } from '../types'
import { state } from '../state'

const MIN_SEGMENT_DURATION = 20
const MAX_SEGMENT_DURATION = 240
const MAX_INTRO_START = 180
const MIN_OUTRO_START_RATIO = 0.5

export const resolveActiveSegments = (): void => {
  const bounds = state.video.duration
  if (bounds <= 0) { state.activeSegments = []; return }

  state.activeSegments = state.parsedSegments
    .filter(s => {
      const len = s.end - s.start
      if (len < MIN_SEGMENT_DURATION || len > MAX_SEGMENT_DURATION) return false
      if (s.start < 0 || s.end <= s.start || s.end > bounds + 1) return false

      if (s.type === 'op') {
        return s.start <= MAX_INTRO_START && s.start <= bounds * 0.5
      }
      if (s.type === 'ed') {
        return s.start >= bounds * MIN_OUTRO_START_RATIO
      }
      return false
    })
}

export const renderSegments = (): void => {
  const track = state.container.querySelector('[data-segments]') as HTMLElement | null
  if (!track) return
  track.innerHTML = ''

  const bounds = state.video.duration
  if (bounds <= 0) return

  state.activeSegments.forEach(s => {
    const bar = document.createElement('div')
    bar.className = 'absolute top-0 h-full bg-white/80'
    bar.style.left = `${(s.start / bounds) * 100}%`
    bar.style.width = `${((s.end - s.start) / bounds) * 100}%`
    track.appendChild(bar)
  })
}
