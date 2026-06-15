import {
  searchInput,
  searchDialog,
  rememberSearchOpener,
  focusLastSearchOpener,
  setLastQuery,
  getActiveRequestController,
  setActiveRequestController,
} from "./state";
import { setSearchState, setClearButtonState, clearResults } from "./render";
import { cancelScheduledFetch, fetchSearchItems } from "./fetch";

export const openSearch = (): void => {
  if (!searchInput) {
    window.location.href = "/search";
    return;
  }

  rememberSearchOpener();
  if (searchDialog) {
    setSearchState(true);
    searchInput.value = "";
    setLastQuery("");
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
  const activeRequestController = getActiveRequestController();
  if (activeRequestController) {
    activeRequestController.abort();
    setActiveRequestController(undefined);
  }
  searchInput.value = "";
  setLastQuery("");
  setClearButtonState(false);
  clearResults();
  focusLastSearchOpener();
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
