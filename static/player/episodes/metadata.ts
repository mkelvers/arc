import { state } from "../state";

/** Fetches episode metadata from API and updates episode-card titles. */
export const setupEpisodeMetadata = (): void => {
  const { episodeList } = state.elements;
  if (!episodeList) {
    return;
  }

  fetch(`/api/watch/episodes/${state.episode.malID}/metadata`)
    .then((res) => res.json())
    .then((data: Array<{ mal_id: number; title?: string }>) => {
      data.forEach((item) => {
        const card = episodeList.querySelector(`[data-episode-id="${item.mal_id}"]`);
        if (!card) {
          return;
        }

        if (item.title) {
          const titleEl = card.querySelector("[data-episode-title]");
          if (titleEl) {
            titleEl.textContent = item.title;
          }
        }
      });
    })
    .catch((error) => {
      window.showToast?.({ message: "Failed to load episode metadata." });
      console.error("failed to load episode metadata:", error);
    });
};
