import { state, searchInput, searchDialog } from "./state";
import { setSearchState, setClearButtonState, clearResults } from "./render";
import { cancelScheduledFetch, fetchSearchItems } from "./fetch";

export const openSearch = (): void => {
  if (!searchInput) {
    window.location.href = "/search";
    return;
  }

  state.lastFocusedSearchOpener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (searchDialog) {
    setSearchState(true);
    searchInput.value = "";
    state.lastQuery = "";
    cancelScheduledFetch();
    setClearButtonState(false);
    clearResults();
  }
  searchInput.focus();
};

export const closeSearch = (): void => {
  if (!searchDialog || !searchInput) {
    return;
  }

  setSearchState(false);
  cancelScheduledFetch();
  if (state.activeRequestController) {
    state.activeRequestController.abort();
    state.activeRequestController = undefined;
  }
  searchInput.value = "";
  state.lastQuery = "";
  setClearButtonState(false);
  clearResults();
  state.lastFocusedSearchOpener?.focus();
};

export const clearSearchInput = (): void => {
  if (!searchInput) {
    return;
  }

  searchInput.value = "";
  searchInput.focus();
  cancelScheduledFetch();
  setClearButtonState(false);
  fetchSearchItems("");
};
