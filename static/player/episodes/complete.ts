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
  } catch {
    state.completionSent = false;
    if (state.completionAttempts < 2) {
      state.completionAttempts++;
      setTimeout(() => completeAnime(episodeNumber), 1000);
    }
  }
};
