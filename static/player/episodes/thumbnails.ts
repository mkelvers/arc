import { state } from "../state";

/**
 * Fetches episode thumbnails and titles from API. Injects images into episode cards, replaces
 * placeholder.
 */
export const setupThumbnails = (): void => {
  const { episodeList } = state.elements;
  if (!episodeList) {
    return;
  }

  fetch(`/api/watch/thumbnails/${state.episode.malID}`)
    .then((res) => res.json())
    .then((data: Array<{ mal_id: number; url: string; title?: string }>) => {
      data.forEach((item) => {
        const card = episodeList.querySelector(`[data-episode-id="${item.mal_id}"]`);
        if (!card) {
          return;
        }

        // inject thumbnail image
        if (item.url) {
          const imgContainer = card.querySelector(".relative.aspect-video");
          if (imgContainer) {
            let img = imgContainer.querySelector("img");
            if (!img) {
              // replace placeholder with actual image
              img = document.createElement("img");
              img.className =
                "h-full w-full object-cover transition-transform group-hover:scale-105";
              img.loading = "lazy";
              imgContainer
                .querySelector(".flex.h-full.w-full.items-center.justify-center")
                ?.remove();
              imgContainer.prepend(img);
            }
            img.src = item.url;
            img.alt = item.title ?? `Episode ${item.mal_id}`;
          }
        }

        // inject title text
        if (item.title) {
          const titleEl = card.querySelector("[data-episode-title]");
          if (titleEl) {
            titleEl.textContent = item.title;
          }
        }
      });
    })
    .catch((error) => {
      window.showToast?.({ message: "Failed to load episode thumbnails." });
      console.error("failed to load episode thumbnails:", error);
    });
};
