import { state } from './state'
import { displayTimeFromAbsolute, absoluteTimeFromDisplay, absoluteTimeFromRatio, getBounds } from './timeline'
import { showControls, toggleMute, togglePlayPause, toggleFullscreen, seekBy, setVolume, formatTime } from './controls'

export const setupKeyboard = (): void => {
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

    switch (e.code) {
      case 'Space':
      case 'KeyK':
        e.preventDefault()
        togglePlayPause()
        showControls()
        break
      case 'ArrowLeft':
      case 'KeyJ':
        e.preventDefault()
        seekBy(-10)
        break
      case 'ArrowRight':
      case 'KeyL':
        e.preventDefault()
        seekBy(10)
        break
      case 'ArrowUp':
        e.preventDefault()
        setVolume(state.video.volume + 0.05)
        showControls()
        break
      case 'ArrowDown':
        e.preventDefault()
        setVolume(state.video.volume - 0.05)
        showControls()
        break
      case 'KeyM':
        e.preventDefault()
        toggleMute()
        showControls()
        break
      case 'KeyF':
        e.preventDefault()
        toggleFullscreen()
        showControls()
        break
      default:
        if (/^\d$/.test(e.key)) {
          const b = getBounds()
          if (b.duration > 0) {
            e.preventDefault()
            state.video.currentTime = absoluteTimeFromRatio(parseInt(e.key, 10) / 10)
            showControls()
          }
        }
    }
  })
}
