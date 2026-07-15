import { state } from "../state";
import { isRecord } from "../validate";

export const completeAnime = async (episodeNumber: number): Promise<boolean> => {
  if (state.episode.completionSent || !state.episode.malID || !episodeNumber) {
    return false;
  }
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
      console.error(`failed to complete anime: status ${res.status}`);
      if (state.episode.completionAttempts < 2) {
        state.episode.completionAttempts++;
        setTimeout(() => {
          completeAnime(episodeNumber).catch((error) => {
            console.error("failed to retry anime completion:", error);
          });
        }, 1000);
      }
      return false;
    }

    const payload: unknown = await res.json().catch(() => null);
    const nextURL =
      isRecord(payload) && typeof payload.next_url === "string" ? payload.next_url : "";
    if (nextURL) {
      window.location.assign(nextURL);
      return true;
    }

    const trigger = document.querySelector("[data-dropdown-trigger]") as HTMLButtonElement | null;
    if (trigger) {
      trigger.textContent = "Completed ";
      const caret = document.createElement("span");
      caret.className = "text-xs";
      caret.textContent = "▾";
      trigger.append(caret);
    }
    return false;
  } catch (error) {
    state.episode.completionSent = false;
    console.error("failed to complete anime:", error);
    if (state.episode.completionAttempts < 2) {
      state.episode.completionAttempts++;
      setTimeout(() => {
        completeAnime(episodeNumber).catch((retryError) => {
          console.error("failed to retry anime completion:", retryError);
        });
      }, 1000);
    }
    return false;
  }
};
