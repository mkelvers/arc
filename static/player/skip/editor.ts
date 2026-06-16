import { state } from "../state";
import { formatTime, showControls } from "../controls";
import { resolveActiveSegments, renderSegments } from "./segments";

type SkipType = "op" | "ed";
type ClosableDropdown = HTMLElement & {
  close: (options?: { restoreFocus?: boolean }) => void;
};

const qs = <T extends Element>(root: ParentNode, sel: string): T | null =>
  root.querySelector(sel) as T | null;

const isClosableDropdown = (element: Element | null): element is ClosableDropdown =>
  element instanceof HTMLElement && "close" in element && typeof element.close === "function";

export const setupSegmentEditor = (): void => {
  const root = document.querySelector("[data-segment-editor-root]") as HTMLElement | null;
  if (!root) return;

  const toggleBtn = qs<HTMLButtonElement>(root, "[data-segment-editor-toggle]");
  const panel = qs<HTMLElement>(root, "[data-segment-editor]");
  if (!toggleBtn || !panel) return;

  const closeBtn = qs<HTMLButtonElement>(panel, "[data-segment-editor-close]");
  const typeValue = qs<HTMLInputElement>(panel, "[data-segment-type-value]");
  const typeLabel = qs<HTMLElement>(panel, "[data-segment-type-label]");
  const markStartBtn = qs<HTMLButtonElement>(panel, "[data-segment-mark-start]");
  const markEndBtn = qs<HTMLButtonElement>(panel, "[data-segment-mark-end]");
  const startLabel = qs<HTMLElement>(panel, "[data-segment-start]");
  const endLabel = qs<HTMLElement>(panel, "[data-segment-end]");
  const resetBtn = qs<HTMLButtonElement>(panel, "[data-segment-reset]");
  const saveBtn = qs<HTMLButtonElement>(panel, "[data-segment-save]");
  const errorBox = qs<HTMLElement>(panel, "[data-segment-error]");
  const typeOptions = Array.from(
    panel.querySelectorAll("[data-segment-type-option]"),
  ) as HTMLButtonElement[];
  const focusableSelector = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  let startTime: number | null = null;
  let endTime: number | null = null;
  let lastActiveElement: HTMLElement | null = null;

  const setError = (msg: string | null): void => {
    if (!errorBox) return;
    if (!msg) {
      errorBox.classList.add("hidden");
      errorBox.textContent = "";
      return;
    }
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };

  const updateLabels = (): void => {
    if (startLabel) startLabel.textContent = startTime == null ? "—" : formatTime(startTime);
    if (endLabel) endLabel.textContent = endTime == null ? "—" : formatTime(endTime);
  };

  const open = (): void => {
    lastActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.classList.remove("hidden");
    panel.classList.add("flex");
    panel.setAttribute("aria-hidden", "false");
    setError(null);
    showControls();
    const firstFocusable = panel.querySelector(focusableSelector) as HTMLElement | null;
    firstFocusable?.focus();
  };
  const close = (): void => {
    panel.classList.add("hidden");
    panel.classList.remove("flex");
    panel.setAttribute("aria-hidden", "true");
    setError(null);
    lastActiveElement?.focus();
  };

  toggleBtn.addEventListener("click", () => {
    if (!panel.classList.contains("hidden")) {
      close();
      return;
    }

    const dropdown = toggleBtn.closest("ui-dropdown");
    if (isClosableDropdown(dropdown)) {
      dropdown.close({ restoreFocus: false });
    }
    open();
  });
  closeBtn?.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (panel.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== "Tab") return;
    const focusables = Array.from(panel.querySelectorAll(focusableSelector)).filter(
      (el) =>
        el instanceof HTMLElement &&
        !el.hasAttribute("disabled") &&
        !el.getAttribute("aria-hidden"),
    ) as HTMLElement[];
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
      return;
    }

    if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // close when clicking the backdrop outside the modal content
  document.addEventListener("pointerdown", (e) => {
    if (panel.classList.contains("hidden")) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (
      (e.target as HTMLElement | null)?.closest("[data-segment-editor] [data-segment-editor-close]")
    )
      return;
    const content = panel.firstElementChild;
    if (content && content.contains(target)) return;
    close();
  });

  // dropdown type selector (uses ui-dropdown for visuals; we manage the value)
  typeOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = (btn.getAttribute("data-value") || "ed") as SkipType;
      if (typeValue) typeValue.value = v;
      if (typeLabel) typeLabel.textContent = v === "op" ? "Opening (OP)" : "Ending (ED)";
      const dropdown = btn.closest("ui-dropdown");
      if (isClosableDropdown(dropdown)) {
        dropdown.close({ restoreFocus: false });
      }
      showControls();
    });
  });

  const reset = (): void => {
    startTime = null;
    endTime = null;
    setError(null);
    updateLabels();
  };
  resetBtn?.addEventListener("click", reset);

  markStartBtn?.addEventListener("click", () => {
    startTime = Math.max(0, state.elements.video.currentTime);
    if (endTime != null && startTime >= endTime) endTime = null;
    setError(null);
    updateLabels();
    showControls();
  });
  markEndBtn?.addEventListener("click", () => {
    endTime = Math.max(0, state.elements.video.currentTime);
    if (startTime != null && endTime <= startTime) {
      setError("End must be after start.");
      return;
    }
    setError(null);
    updateLabels();
    showControls();
  });

  saveBtn?.addEventListener("click", async () => {
    const skipType = ((typeValue?.value || "ed") as SkipType) ?? "ed";
    if (startTime == null || endTime == null) {
      setError("Mark start and end first.");
      return;
    }
    if (endTime <= startTime) {
      setError("End must be after start.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.classList.add("opacity-70");
    setError(null);
    try {
      const res = await fetch("/api/watch/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mal_id: state.episode.malID,
          episode: Number.parseInt(state.episode.current, 10),
          skip_type: skipType,
          start_time: startTime,
          end_time: endTime,
        }),
      });
      if (!res.ok) {
        let message = res.status === 401 ? "Login required." : "Failed to save segment.";
        let payload: { error?: string } | null = null;
        try {
          payload = await res.json();
        } catch (error) {
          console.error("failed to parse response json:", error);
        }
        if (payload?.error) message = payload.error;
        setError(message);
        return;
      }

      // Update local segments immediately so UI reflects the saved data.
      const normalizedType = skipType === "ed" ? "ending" : "opening";
      state.skip.parsedSegments = state.skip.parsedSegments.filter((s) => {
        const t = (s.type || "").toLowerCase();
        if (normalizedType === "ending") return t !== "ed" && t !== "ending" && t !== "outro";
        return t !== "op" && t !== "opening" && t !== "intro";
      });
      state.skip.parsedSegments.push({
        type: normalizedType,
        start: startTime,
        end: endTime,
        source: "override",
      });
      resolveActiveSegments();
      renderSegments();

      window.showToast?.({ message: "Segment saved." });
      close();
    } catch (error) {
      setError("Failed To Save Segment.");
      console.error("failed to save segment:", error);
      throw error;
    } finally {
      saveBtn.disabled = false;
      saveBtn.classList.remove("opacity-70");
    }
  });

  updateLabels();
};
