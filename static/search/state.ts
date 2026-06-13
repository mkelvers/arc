export interface CommandPaletteItem {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  href: string;
  image?: string;
  icon?: string;
}

export interface CommandPaletteResponse {
  items: CommandPaletteItem[];
  hasNextPage: boolean;
  nextPage?: number;
}

export const commandPaletteInitializedKey = Symbol("commandPaletteInitialized");
export const globalWindow = window as Window & { [commandPaletteInitializedKey]?: boolean };

export const searchInput = document.getElementById(
  "command-palette-input",
) as HTMLInputElement | null;
export const searchResults = document.querySelector(
  "[data-command-palette-results]",
) as HTMLElement | null;
export const searchDialog = document.querySelector(
  "[data-command-palette-dialog]",
) as HTMLElement | null;
export const searchRoot = document.querySelector(
  "[data-command-palette-root]",
) as HTMLElement | null;
export const searchPage = document.querySelector(
  "[data-command-palette-page]",
) as HTMLElement | null;
export const searchOpenButtons = document.querySelectorAll("[data-command-palette-open]");
export const searchCloseButtons = document.querySelectorAll("[data-command-palette-close]");
export const searchClearButtons = document.querySelectorAll("[data-command-palette-clear]");
export const shortcutHints = document.querySelectorAll("[data-command-palette-shortcut]");

export const state = {
  resultItems: [] as CommandPaletteItem[],
  selectedIndex: 0,
  fetchTimeout: undefined as number | undefined,
  lastQuery: "",
  activeRequestController: undefined as AbortController | undefined,
  nextSearchPage: undefined as number | undefined,
  hasNextSearchPage: false,
  isFetchingNextPage: false,
  lastFocusedSearchOpener: null as HTMLElement | null,
};

export const responseCache = new Map<string, CommandPaletteResponse>();

export const iconPaths: Record<string, string> = {
  bookmark: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z",
  compass:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z",
  play: "M8 5v14l11-7z",
  search: "M11 19a8 8 0 1 1 5.65-2.35L21 21 M16.65 16.65 21 21",
  trending: "M3 17l6-6 4 4 8-8 M14 7h7v7",
};

export const typeLabels: Record<string, string> = {
  anime: "Top results",
};

export const groupOrder = ["anime"];
export const maxPosterImageRetries = 2;

export const isMac = (): boolean => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const isSearchOpen = (): boolean => searchDialog?.classList.contains("flex") ?? false;

export const isSafeImageUrl = (rawUrl?: string): boolean => {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};
