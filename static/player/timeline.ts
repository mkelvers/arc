import { TimelineBounds } from './types'
import { state } from './state'

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

let cachedBounds: TimelineBounds = { start: 0, end: 0, duration: 0 }

export const timelineBounds = (): TimelineBounds => {
  const duration = Number.isFinite(state.video.duration) && state.video.duration > 0 ? state.video.duration : 0
  let start = 0
  if (state.video.seekable.length > 0) {
    const seekableStart = state.video.seekable.start(0)
    if (Number.isFinite(seekableStart) && seekableStart > 0) start = seekableStart
  }
  if (duration > start) {
    return { start, end: duration, duration: duration - start }
  }
  if (state.video.seekable.length > 0) {
    const seekableEnd = state.video.seekable.end(state.video.seekable.length - 1)
    if (Number.isFinite(seekableEnd) && seekableEnd > start) {
      return { start, end: seekableEnd, duration: seekableEnd - start }
    }
  }
  return { start: 0, end: duration, duration }
}

export const invalidateBounds = (): void => {
  cachedBounds = timelineBounds()
}

export const getBounds = (): TimelineBounds => cachedBounds

export const displayTimeFromAbsolute = (absoluteTime: number): number => {
  const b = getBounds()
  if (!Number.isFinite(absoluteTime) || b.duration <= 0) return 0
  return Math.max(b.start, Math.min(b.end, absoluteTime)) - b.start
}

export const absoluteTimeFromDisplay = (displayTime: number): number => {
  const b = getBounds()
  if (!Number.isFinite(displayTime) || b.duration <= 0) return 0
  return b.start + Math.max(0, Math.min(b.duration, displayTime))
}

export const absoluteTimeFromRatio = (ratio: number): number => {
  const b = getBounds()
  if (!Number.isFinite(ratio) || b.duration <= 0) return 0
  return b.start + Math.max(0, Math.min(1, ratio)) * b.duration
}

export const getBufferedEnd = (): number => {
  const currentTime = state.video.currentTime
  let end = 0
  for (let i = 0; i < state.video.buffered.length; i++) {
    if (state.video.buffered.start(i) <= currentTime && state.video.buffered.end(i) >= currentTime) {
      end = state.video.buffered.end(i)
      break
    }
  }
  if (end === 0) {
    for (let i = 0; i < state.video.buffered.length; i++) {
      if (state.video.buffered.end(i) > currentTime) {
        end = Math.max(end, state.video.buffered.end(i))
      }
    }
  }
  return end
}

export const updateTimeline = (currentTime: number): void => {
  const { progress, scrubber, timeDisplay, durationDisplay, buffered } = getTimelineEls()
  const b = getBounds()

  if (b.duration <= 0) {
    progress.style.width = '0%'
    buffered.style.width = '0%'
    scrubber.style.left = '0%'
    timeDisplay.textContent = '00:00'
    durationDisplay.textContent = '00:00'
    return
  }

  const pct = (displayTimeFromAbsolute(currentTime) / b.duration) * 100
  progress.style.width = `${pct}%`
  scrubber.style.left = `${pct}%`
  timeDisplay.textContent = formatTime(displayTimeFromAbsolute(currentTime))
  durationDisplay.textContent = formatTime(b.duration)

  const bufferedEnd = getBufferedEnd()
  const bufferedPct = (displayTimeFromAbsolute(bufferedEnd) / b.duration) * 100
  buffered.style.width = `${bufferedPct}%`
}
