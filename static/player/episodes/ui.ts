import { state } from '../state'
import { updateSubtitleOptions } from '../subtitles'
import { updateQualityOptions } from '../quality'
import { updateModeButtons } from '../mode'

export const setupAutoplayButton = (): void => {
  const btn = document.querySelector('[data-autoplay]') as HTMLInputElement | null
  if (!btn) return
  btn.checked = localStorage.getItem('mal:autoplay-enabled') !== 'false'
}

export const isAutoplayEnabled = (): boolean => localStorage.getItem('mal:autoplay-enabled') !== 'false'

export const updateOverlay = (episode: string, title: string): void => {
  if (!state.videoOverlay) return
  const p = state.videoOverlay.querySelector('p')
  p && (p.textContent = title ? `Episode ${episode}, ${title}` : `Episode ${episode}`)
}

const getEpisodeEls = () => {
  const grid = state.episodeGrid
  const list = state.episodeList
  return {
    gridEls: grid ? Array.from(grid.querySelectorAll('[data-episode-id]')) : [],
    listEls: list ? Array.from(list.querySelectorAll('[data-episode-id]')) : [],
  }
}

export const updateEpisodeHighlight = (num: number): void => {
  const { gridEls, listEls } = getEpisodeEls()
  ;[...gridEls, ...listEls].forEach(el => el.classList.remove('ring-2', 'ring-accent', 'bg-accent/20', 'text-accent'))

  const gridEl = state.episodeGrid?.querySelector(`[data-episode-id="${num}"]`)
  const listEl = state.episodeList?.querySelector(`[data-episode-id="${num}"]`)
  gridEl?.classList.add('ring-2', 'ring-accent')
  listEl?.classList.add('ring-2', 'ring-accent')
  ;(gridEl ?? listEl)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export const switchEpisodeRange = (idx: number): void => {
  const dropdown = state.container.querySelector('[data-episode-dropdown]') as HTMLElement | null
  if (!dropdown) return
  const btns = Array.from(dropdown.querySelectorAll('.episode-range-btn')) as HTMLButtonElement[]
  const target = btns[idx]
  if (!target) return

  const start = Number.parseInt(target.dataset.rangeStart ?? '1', 10)
  const end = Number.parseInt(target.dataset.rangeEnd ?? '100', 10)

  const label = dropdown.querySelector('[data-dropdown-label]') as HTMLElement | null
  if (label) label.textContent = `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}`

  state.episodeGrid?.querySelectorAll('[data-episode-id]').forEach(el => {
    const n = Number.parseInt((el as HTMLElement).dataset.episodeId ?? '0', 10)
    el.classList.toggle('hidden', n < start || n > end)
  })
}
