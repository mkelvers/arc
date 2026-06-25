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

const initAnimeSidebarDrawer = (): void => {
  onReady(() => {
    const drawer = document.querySelector<HTMLElement>("[data-anime-sidebar-drawer]");
    const openButton = document.querySelector<HTMLButtonElement>("[data-anime-sidebar-open]");
    const closeButton = document.querySelector<HTMLButtonElement>("[data-anime-sidebar-close]");
    const backdrop = document.querySelector<HTMLButtonElement>("[data-anime-sidebar-backdrop]");
    if (!drawer || !openButton || !closeButton || !backdrop) {
      return;
    }

    let startX = 0;
    let startY = 0;
    let activeTouchId: number | null = null;
    let isOpen = false;

    const syncState = (): void => {
      drawer.classList.toggle("hidden", !isOpen);
      drawer.classList.toggle("translate-x-0", isOpen);
      drawer.classList.toggle("translate-x-full", !isOpen);
      backdrop.classList.toggle("hidden", !isOpen);
      document.body.classList.toggle("overflow-hidden", isOpen);
      openButton.setAttribute("aria-expanded", String(isOpen));
    };

    const open = (): void => {
      isOpen = true;
      syncState();
    };

    const close = (): void => {
      isOpen = false;
      syncState();
    };

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    backdrop.addEventListener("click", close);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) {
        close();
      }
    });

    const getTouch = (event: TouchEvent): Touch | null => {
      if (activeTouchId === null) {
        return event.touches[0] ?? event.changedTouches[0] ?? null;
      }
      return (
        Array.from(event.touches).find((touch) => touch.identifier === activeTouchId) ??
        Array.from(event.changedTouches).find((touch) => touch.identifier === activeTouchId) ??
        null
      );
    };

    document.addEventListener(
      "touchstart",
      (event) => {
        if (window.innerWidth >= 1024) {
          return;
        }
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        if (!isOpen && touch.clientX < window.innerWidth - 28) {
          return;
        }
        activeTouchId = touch.identifier;
        startX = touch.clientX;
        startY = touch.clientY;
      },
      { passive: true },
    );

    document.addEventListener(
      "touchend",
      (event) => {
        if (window.innerWidth >= 1024 || activeTouchId === null) {
          return;
        }
        const touch = getTouch(event);
        activeTouchId = null;
        if (!touch) {
          return;
        }

        const deltaX = touch.clientX - startX;
        const deltaY = Math.abs(touch.clientY - startY);
        if (deltaY > 60) {
          return;
        }

        if (!isOpen && startX >= window.innerWidth - 28 && deltaX < -48) {
          open();
          return;
        }

        if (isOpen && deltaX > 48) {
          close();
        }
      },
      { passive: true },
    );

    syncState();
  });
};

initSynopsisToggle();
initThemesDialog();
initAnimeSidebarDrawer();
