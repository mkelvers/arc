import { state } from "../state";
import { displayTimeFromAbsolute, absoluteTimeFromDisplay } from "../timeline";
import { showControls } from "../controls";
import { saveProgress } from "../progress";
import { safeLocalStorage } from "../storage";

// button label based on segment type
const skipLabel = (type: string): string => (type === "ed" ? "Skip outro" : "Skip intro");

/**
 * Updates skip button visibility and auto-skip logic.
 * Called on timeupdate. Shows button when in active segment.
 */
export const updateSkipButton = (currentTime: number): void => {
  const btn = state.elements.container.querySelector("[data-skip]") as HTMLButtonElement | null;
  const displayTime = displayTimeFromAbsolute(currentTime);

  // find segment that contains current time (with delay buffer)
  const segment = state.skip.activeSegments.find((s) => {
    const delay = Math.min(1, Math.max(0.25, (s.end - s.start) * 0.02));
    return displayTime >= s.start + delay && displayTime < s.end;
  });

  if (!segment) {
    state.skip.activeSegment = null;
    btn?.classList.add("hidden");
    return;
  }

  // auto-skip: jump to end if enabled
  const autoSkip = safeLocalStorage.getItem("mal:autoskip-enabled") === "true";
  if (autoSkip && displayTime >= segment.start && displayTime < segment.end) {
    state.elements.video.currentTime = absoluteTimeFromDisplay(segment.end + 0.01);
    saveProgress().catch((error) => {
      console.error("autoskip progress save failed:", error);
    });
    return;
  }

  // show skip button
  state.skip.activeSegment = segment;
  if (btn) {
    btn.textContent = skipLabel(segment.type);
    btn.title = skipLabel(segment.type);
    btn.classList.remove("hidden");
  }
};

/**
 * Syncs autoskip checkbox with localStorage.
 */
export const updateAutoSkipButton = (): void => {
  const btn = document.querySelector("[data-autoskip]") as HTMLInputElement | null;
  if (!btn) return;
  btn.checked = safeLocalStorage.getItem("mal:autoskip-enabled") === "true";
};

/**
 * Binds autoskip toggle change handler.
 */
export const setupSkip = (): void => {
  document.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute("data-autoskip")) {
      safeLocalStorage.setItem(
        "mal:autoskip-enabled",
        (target as HTMLInputElement).checked ? "true" : "false",
      );
      showControls();
    }
  });
};
