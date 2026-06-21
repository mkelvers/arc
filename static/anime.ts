import { closestFocusable, onReady } from "./utils";

const initSynopsisToggle = (): void => {
  document.addEventListener("click", (event) => {
    const { target } = event;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-synopsis-toggle]");
    if (!button) {
      return;
    }

    const section = button.closest("section");
    const container = section?.querySelector<HTMLElement>("[data-synopsis-container]");
    if (!container) {
      return;
    }

    const isClamped = container.classList.contains("line-clamp-6");
    container.classList.toggle("line-clamp-6", !isClamped);
    button.textContent = isClamped ? "Read more" : "Show less";
  });
};

const initThemesDialog = (): void => {
  onReady(() => {
    const dialog = document.querySelector<HTMLElement>("[data-themes-dialog]");
    const openButton = document.querySelector<HTMLButtonElement>("[data-themes-open]");
    const closeButton = document.querySelector<HTMLButtonElement>("[data-themes-close]");
    const content = document.querySelector<HTMLElement>("[data-themes-content]");
    const loader = document.querySelector<HTMLElement>("[data-themes-loader]");
    if (!dialog || !openButton || !content || !loader) {
      return;
    }

    let themesRequested = false;
    let lastFocused: HTMLElement | null = null;

    const open = (): void => {
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.classList.remove("hidden");
      dialog.classList.add("flex");
      dialog.setAttribute("aria-hidden", "false");
      closestFocusable(dialog)?.focus();

      if (themesRequested) {
        return;
      }
      themesRequested = true;
      content.textContent = "Loading theme songs...";
      const htmxApi = (
        window as Window & { htmx?: { trigger: (target: Element, name: string) => void } }
      ).htmx;
      htmxApi?.trigger(document.body, "theme-songs:load");
    };

    const close = (): void => {
      dialog.classList.add("hidden");
      dialog.classList.remove("flex");
      dialog.setAttribute("aria-hidden", "true");
      lastFocused?.focus();
    };

    openButton.addEventListener("click", open);
    closeButton?.addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        close();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (dialog.classList.contains("hidden")) {
        return;
      }
      event.preventDefault();
      close();
    });

    loader.addEventListener("htmx:responseError", () => {
      themesRequested = false;
    });
    loader.addEventListener("htmx:sendError", () => {
      themesRequested = false;
    });
  });
};

initSynopsisToggle();
initThemesDialog();
