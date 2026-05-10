import DOMPurify from 'dompurify';
import { state } from '../state';

export const completeAnime = async (episodeNumber: number): Promise<void> => {
  if (state.completionSent || !state.malID || !episodeNumber) return;
  state.completionSent = true;

  try {
    const res = await fetch('/api/watch-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ mal_id: state.malID, episode: episodeNumber }),
    });

    if (!res.ok) {
      state.completionSent = false;
      if (state.completionAttempts < 2) {
        state.completionAttempts++;
        setTimeout(() => completeAnime(episodeNumber), 1000);
      }
      return;
    }

    const trigger = document.querySelector('[data-dropdown-trigger]') as HTMLButtonElement | null;
    if (trigger) {
      trigger.textContent = 'Completed ';
      const caret = document.createElement('span');
      caret.className = 'text-xs';
      caret.textContent = '▾';
      trigger.appendChild(caret);
    }

    const dropdown = document.getElementById('watch-status-dropdown');
    if (dropdown) {
      const payload = {
        anime_id: String(state.malID),
        anime_title: state.container.dataset.animeTitle ?? '',
        anime_title_english: state.container.dataset.animeTitleEnglish ?? '',
        anime_title_japanese: state.container.dataset.animeTitleJapanese ?? '',
        anime_image: state.container.dataset.animeImage ?? '',
        status: 'completed',
        airing: state.container.dataset.animeAiring === 'true',
      };

      fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'HX-Request': 'true' },
        body: `anime_id=${encodeURIComponent(payload.anime_id)}&anime_title=${encodeURIComponent(payload.anime_title)}&anime_title_english=${encodeURIComponent(payload.anime_title_english)}&anime_title_japanese=${encodeURIComponent(payload.anime_title_japanese)}&anime_image=${encodeURIComponent(payload.anime_image)}&status=${encodeURIComponent(payload.status)}&airing=${encodeURIComponent(String(payload.airing))}`,
        credentials: 'same-origin',
      })
        .then(async res => {
          if (!res.ok) return;
          const html = await res.text();
          const wrapper = document.createElement('span');
          wrapper.id = 'watch-status-dropdown';
          wrapper.innerHTML = DOMPurify.sanitize(html);
          dropdown.replaceWith(wrapper);
        })
        .catch(() => {});
    }
  } catch {
    state.completionSent = false;
    if (state.completionAttempts < 2) {
      state.completionAttempts++;
      setTimeout(() => completeAnime(episodeNumber), 1000);
    }
  }
};
