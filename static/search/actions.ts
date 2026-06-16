import { searchInput } from "./state";
import { setClearButtonState } from "./render";
import { cancelScheduledFetch, fetchSearchItems } from "./fetch";

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
