import { cancelScheduledFetch, fetchSearchItems } from "./fetch";
import { setClearButtonState } from "./render";
import { searchInput } from "./state";

export const openSearch = (): void => {
  if (!searchInput) {
    window.location.href = "/search";
    return;
  }

  searchInput.focus();
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
