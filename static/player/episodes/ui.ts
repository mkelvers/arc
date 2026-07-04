import { qs } from "../../q";
import { state } from "../state";
import { safeLocalStorage } from "../storage";

/** Syncs autoplay checkbox with localStorage on init. Default is enabled (not 'false'). */
export const setupAutoplayButton = (): void => {
  const btn = document.querySelector("[data-autoplay]") as HTMLInputElement | null;
  if (!btn) {
    return;
  }
  btn.checked = safeLocalStorage.getItem("mal:autoplay-enabled") !== "false";
};

export const isAutoplayEnabled = (): boolean =>
  safeLocalStorage.getItem("mal:autoplay-enabled") !== "false";

/** Updates video overlay text (shown briefly on episode change). */
export const updateOverlay = (episode: string, title: string): void => {
  if (!state.elements.videoOverlay) {
    return;
  }
  const p = state.elements.videoOverlay.querySelector("p");
  if (!p) {
    return;
  }
  p.textContent = title ? `Episode ${episode}, ${title}` : `Episode ${episode}`;
};

// helper: get all episode elements from grid and list
const getEpisodeEls = () => {
  const grid = state.elements.episodeGrid;
  const list = state.elements.episodeList;
  return {
    gridEls: grid ? [...grid.querySelectorAll("[data-episode-id]")] : [],
    listEls: list ? [...list.querySelectorAll("[data-episode-id]")] : [],
  };
};

/** Highlights current episode in grid and list. */
export const updateEpisodeHighlight = (num: number, restoreFocus: boolean = false): void => {
  const { gridEls, listEls } = getEpisodeEls();
  // clear old highlights
  [...gridEls, ...listEls].forEach((el) => {
    el.classList.remove("ring-1", "ring-accent", "bg-accent/15", "bg-accent/20", "text-accent");
    el.removeAttribute("aria-current");
  });

  // apply new highlight
  const gridEl = state.elements.episodeGrid?.querySelector(`[data-episode-id="${num}"]`);
  const listEl = state.elements.episodeList?.querySelector(`[data-episode-id="${num}"]`);
  gridEl?.classList.add("bg-accent/15", "text-accent", "ring-1", "ring-accent");
  listEl?.classList.add("bg-accent/20");
  gridEl?.setAttribute("aria-current", "page");
  listEl?.setAttribute("aria-current", "page");
  // scroll into view
  const activeElement = gridEl ?? listEl;
  activeElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (restoreFocus && activeElement instanceof HTMLElement) {
    activeElement.focus({ preventScroll: true });
  }
};

const setNavigationLink = (selector: string, episode: number, visible: boolean): void => {
  const anchor = document.querySelector(selector) as HTMLAnchorElement | null;
  if (!anchor) {
    return;
  }
  const url = new URL(anchor.href, window.location.href);
  url.searchParams.set("ep", String(episode));
  anchor.href = url.toString();
  anchor.dataset.episodeId = String(episode);
  anchor.classList.toggle("hidden", !visible);
  anchor.classList.toggle("inline-flex", visible);
  anchor.setAttribute("aria-hidden", visible ? "false" : "true");
  anchor.tabIndex = visible ? 0 : -1;
};

/** Keeps the real Previous and Next links correct after an in-page transition. */
export const updateEpisodeNavigation = (episode: number): void => {
  setNavigationLink("[data-episode-prev]", Math.max(1, episode - 1), episode > 1);
  setNavigationLink(
    "[data-episode-next]",
    state.episode.total > 0 ? Math.min(state.episode.total, episode + 1) : episode + 1,
    state.episode.total === 0 || episode < state.episode.total,
  );
};

/** Switches visible episode range in grid. Updates dropdown label and hides/shows episode cards. */
export const switchEpisodeRange = (idx: number): void => {
  const dropdown = qs<HTMLElement>("[data-episode-dropdown]");
  if (!dropdown) {
    return;
  }
  const btns = [...dropdown.querySelectorAll(".episode-range-btn")] as HTMLButtonElement[];
  const target = btns[idx];
  if (!target) {
    return;
  }

  const start = Number.parseInt(target.dataset.rangeStart ?? "1", 10);
  const end = Number.parseInt(target.dataset.rangeEnd ?? "100", 10);

  // update label (e.g., "01-100")
  const label = dropdown.querySelector("[data-dropdown-label]") as HTMLElement | null;
  if (label) {
    label.textContent = `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
  }

  // show/hide episodes in range
  state.elements.episodeGrid?.querySelectorAll("[data-episode-id]").forEach((el) => {
    const n = Number.parseInt((el as HTMLElement).dataset.episodeId ?? "0", 10);
    el.classList.toggle("hidden", n < start || n > end);
  });
};
