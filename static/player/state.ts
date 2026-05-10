import { ModeSource, SkipSegment, SubtitleCue, SubtitleTrack, ActiveSegment } from './types'
import { q, qs, dataset } from '../q'

export interface PlayerState {
  container: HTMLElement
  video: HTMLVideoElement
  modeSources: Record<string, ModeSource>
  availableModes: string[]
  currentMode: string
  currentEpisode: string
  totalEpisodes: number
  malID: number
  streamURL: string
  initialStreamToken: string
  shouldAutoPlay: boolean
  parsedSegments: SkipSegment[]
  activeSegments: ActiveSegment[]
  activeSkipSegment: ActiveSegment | null
  activeSubtitles: SubtitleCue[]
  currentSubtitleTracks: SubtitleTrack[]
  lastKnownVolume: number
  pendingSeekTime: number | null
  isScrubbing: boolean
  isFullscreen: boolean
  playerControlsTimeout: number | undefined
  progressSaveTimer: number | undefined
  transitionEpisode: number | null
  completionSent: boolean
  completionAttempts: number
  lastSavedProgress: { episode: string; seconds: number }
  episodeGrid: HTMLElement | null
  episodeList: HTMLElement | null
  previewPopover: HTMLElement | null
  previewTime: HTMLElement | null
  videoOverlay: HTMLElement | null
}

export const state: PlayerState = {
  container: null as unknown as HTMLElement,
  video: null as unknown as HTMLVideoElement,
  modeSources: {},
  availableModes: [],
  currentMode: 'dub',
  currentEpisode: '1',
  totalEpisodes: 0,
  malID: 0,
  streamURL: '/watch/proxy/stream',
  initialStreamToken: '',
  shouldAutoPlay: false,
  parsedSegments: [],
  activeSegments: [],
  activeSkipSegment: null,
  activeSubtitles: [],
  currentSubtitleTracks: [],
  lastKnownVolume: 1,
  pendingSeekTime: null,
  isScrubbing: false,
  isFullscreen: false,
  playerControlsTimeout: undefined,
  progressSaveTimer: undefined,
  transitionEpisode: null,
  completionSent: false,
  completionAttempts: 0,
  lastSavedProgress: { episode: '1', seconds: -1 },
  episodeGrid: null,
  episodeList: null,
  previewPopover: null,
  previewTime: null,
  videoOverlay: null,
}

export const initState = (c: HTMLElement): void => {
  state.container = c
  state.video = q<HTMLVideoElement>(c, 'video')!
  state.previewPopover = q<HTMLElement>(c, '[data-preview-popover]')
  state.previewTime = q<HTMLElement>(c, '[data-preview-time]')
  state.videoOverlay = q<HTMLElement>(c, '[data-video-overlay]')

  state.malID = Number.parseInt(dataset(c, 'malId'), 10)
  state.currentEpisode = dataset(c, 'currentEpisode') || '1'
  state.totalEpisodes = Number.parseInt(dataset(c, 'totalEpisodes'), 10)
  state.streamURL = dataset(c, 'streamUrl') || '/watch/proxy/stream'
  state.initialStreamToken = dataset(c, 'streamToken') || ''
  state.shouldAutoPlay = sessionStorage.getItem('mal:autoplay-next') === 'true'
  sessionStorage.removeItem('mal:autoplay-next')

  state.episodeGrid = qs<HTMLElement>('[data-episode-grid]')
  state.episodeList = qs<HTMLElement>('[data-episode-list]')

  const safeJson = <T>(raw: string | undefined, fallback: T): T => {
    try { return JSON.parse(raw ?? '') as T } catch { return fallback }
  }

  state.modeSources = safeJson(dataset(c, 'modeSources'), {} as Record<string, ModeSource>)
  state.availableModes = safeJson(dataset(c, 'availableModes'), [] as string[])

  const backendInitialMode = dataset(c, 'initialMode') || 'dub'
  const storedMode = localStorage.getItem('player-audio-mode')
  const initialMode = (storedMode && state.availableModes.includes(storedMode)) ? storedMode : backendInitialMode
  const fallbackMode = Object.keys(state.modeSources).find(
    m => state.modeSources[m]?.token
  )
  state.currentMode =
    (state.modeSources[initialMode]?.token) ? initialMode :
    (fallbackMode ?? state.availableModes[0] ?? 'dub')

  const segments = safeJson(dataset(c, 'segments'), [] as SkipSegment[])
  state.parsedSegments = segments
    .map(s => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
    .filter(s => s.end > s.start)
}
