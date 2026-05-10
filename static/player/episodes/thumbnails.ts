import { state } from '../state'

export const setupThumbnails = (): void => {
  fetch(`/api/watch/thumbnails/${state.malID}`)
    .then(res => res.json())
    .then((data: Array<{ mal_id: number; url: string; title?: string }>) => {
      if (!state.episodeList) return
      data.forEach(item => {
        const card = state.episodeList.querySelector(`[data-episode-id="${item.mal_id}"]`)
        if (!card) return

        if (item.url) {
          const imgContainer = card.querySelector('.relative.aspect-video')
          if (imgContainer) {
            let img = imgContainer.querySelector('img')
            if (!img) {
              img = document.createElement('img')
              img.className = 'h-full w-full object-cover transition-transform group-hover:scale-105'
              img.loading = 'lazy'
              imgContainer.querySelector('.flex.h-full.w-full.items-center.justify-center')?.remove()
              imgContainer.prepend(img)
            }
            img.src = item.url
            img.alt = item.title ?? `Episode ${item.mal_id}`
          }
        }

        if (item.title) {
          const titleEl = card.querySelector('[data-episode-title]')
          if (titleEl) titleEl.textContent = item.title
        }
      })
    })
    .catch(err => console.error('Failed to fetch thumbnails:', err))
}
