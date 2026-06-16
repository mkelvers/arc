import { state } from "../state";

export const completeAnime = async (episodeNumber: number): Promise<void> => {
  if (state.episode.completionSent || !state.episode.malID || !episodeNumber) return;
  state.episode.completionSent = true;

  try {
    const res = await fetch("/api/watch-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ mal_id: state.episode.malID, episode: episodeNumber }),
    });

    if (!res.ok) {
      state.episode.completionSent = false;
      if (state.episode.completionAttempts < 2) {
        state.episode.completionAttempts++;
        setTimeout(() => completeAnime(episodeNumber), 1000);
      }
      return;
    }

    const trigger = document.querySelector("[data-dropdown-trigger]") as HTMLButtonElement | null;
    if (trigger) {
      trigger.textContent = "Completed ";
      const caret = document.createElement("span");
      caret.className = "text-xs";
      caret.textContent = "▾";
      trigger.appendChild(caret);
    }
  } catch (error) {
    state.episode.completionSent = false;
    console.error("failed to complete anime:", error);
    if (state.episode.completionAttempts < 2) {
      state.episode.completionAttempts++;
      setTimeout(() => completeAnime(episodeNumber), 1000);
    }
  }
};
