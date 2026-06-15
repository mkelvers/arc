import {
  commandPaletteInitializedKey,
  globalWindow,
  searchInput,
  searchResults,
  searchRoot,
  searchPage,
  searchOpenButtons,
  searchCloseButtons,
  searchClearButtons,
  searchDialog,
  getSelectedIndex,
  isSearchOpen,
  isTypingTarget,
} from "./state";
import { setShortcutHints, selectItem, runSelectedItem, renderEmptyState } from "./render";
import { scheduleFetch, fetchSearchItems, onResultsScroll } from "./fetch";
import { openSearch, closeSearch, clearSearchInput } from "./actions";

const onDocumentClick = (event: MouseEvent): void => {
  if (event.target === searchDialog) {
    closeSearch();
  }
};

const onInputKeydown = (event: KeyboardEvent): void => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectItem(getSelectedIndex() + 1, true);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectItem(getSelectedIndex() - 1, true);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    runSelectedItem();
  }
};

const onDocumentKeydown = (event: KeyboardEvent): void => {
  const commandShortcut = event.key.toLowerCase() === "p" && (event.metaKey || event.ctrlKey);

  if (commandShortcut && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (searchPage) {
      searchInput?.focus();
    } else if (isSearchOpen()) {
      closeSearch();
    } else {
      openSearch();
    }
    return;
  }

  if (event.key === "/" && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (searchPage) {
      searchInput?.focus();
    } else {
      openSearch();
    }
    return;
  }

  if (event.key === "Escape" && isSearchOpen()) {
    event.preventDefault();
    closeSearch();
  }
};

export const initSearchOverlay = (): void => {
  if (globalWindow[commandPaletteInitializedKey]) {
    return;
  }
  globalWindow[commandPaletteInitializedKey] = true;

  if (!searchInput || !searchResults || !searchRoot) {
    return;
  }

  setShortcutHints();
  searchOpenButtons.forEach((button) => {
    button.addEventListener("click", openSearch);
  });
  searchCloseButtons.forEach((button) => {
    button.addEventListener("click", closeSearch);
  });
  searchClearButtons.forEach((button) => {
    button.addEventListener("click", clearSearchInput);
  });
  searchInput.addEventListener("input", scheduleFetch);
  searchInput.addEventListener("keydown", onInputKeydown);
  searchResults.addEventListener("scroll", onResultsScroll);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  searchDialog?.setAttribute("aria-hidden", "true");

  const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() || "";
  if (initialQuery) {
    searchInput.value = initialQuery;
    fetchSearchItems(initialQuery);
  } else {
    renderEmptyState("");
  }
  if (searchPage) {
    searchInput.focus();
  }
};
