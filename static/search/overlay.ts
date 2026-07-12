import { openSearch, clearSearchInput } from "./actions";
import { scheduleFetch, fetchSearchItems, onResultsScroll } from "./fetch";
import { selectItem, runSelectedItem, renderEmptyState } from "./render";
import {
  searchInitializedKey,
  globalWindow,
  searchInput,
  searchResults,
  searchRoot,
  searchPage,
  searchClearButtons,
  getSelectedIndex,
  isTypingTarget,
} from "./state";

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
};

export const initSearchPage = (): void => {
  if (globalWindow[searchInitializedKey]) {
    return;
  }
  globalWindow[searchInitializedKey] = true;

  if (!searchInput || !searchResults || !searchRoot) {
    return;
  }

  searchClearButtons.forEach((button) => {
    button.addEventListener("click", clearSearchInput);
  });
  searchInput.addEventListener("input", scheduleFetch);
  searchInput.addEventListener("keydown", onInputKeydown);
  searchResults.addEventListener("scroll", onResultsScroll);
  document.addEventListener("keydown", onDocumentKeydown);

  const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() || "";
  if (initialQuery) {
    searchInput.value = initialQuery;
    fetchSearchItems(initialQuery);
  } else {
    renderEmptyState();
  }
  if (searchPage) {
    searchInput.focus();
  }
};
