export {};

import { onReady } from "./utils";

type ToastFn = (opts: {
  message: string;
  duration?: number;
  variant?: "default" | "destructive";
}) => void;

type HtmxParameters = Record<string, string | string[]>;

type HtmxConfigRequestDetail = {
  elt?: Element;
  parameters?: HtmxParameters;
};

const getToast = (): ToastFn | null => {
  const anyWindow = window as unknown as { showToast?: ToastFn };
  return typeof anyWindow.showToast === "function" ? anyWindow.showToast : null;
};

const toast = (message: string): void => {
  getToast()?.({ message });
};

const setBusy = (el: Element | null, busy: boolean): void => {
  if (!(el instanceof HTMLElement)) return;
  el.toggleAttribute("aria-busy", busy);
  el.dataset.htmxLoading = busy ? "true" : "false";

  if (el instanceof HTMLButtonElement) {
    el.disabled = busy;
  }

  if (busy) {
    el.dataset.htmxBusy = "true";
    return;
  }

  delete el.dataset.htmxBusy;
};

const getTriggerFromHtmxEvent = (event: Event): Element | null => {
  const detail = event as unknown as { detail?: { elt?: Element } };
  return detail.detail?.elt ?? null;
};

const isBrowseForm = (form: HTMLFormElement): boolean =>
  form.getAttribute("action") === "/browse" || form.getAttribute("hx-get") === "/browse";

const selectedGenreValues = (): string[] =>
  Array.from(document.querySelectorAll<HTMLInputElement>("[data-genre-visual]:checked"))
    .map((input) => input.value)
    .filter((value) => value !== "");

const syncBrowseRequestParameters = (event: Event): void => {
  const detail = (event as CustomEvent<HtmxConfigRequestDetail>).detail;
  if (!detail.parameters) return;

  const form = detail.elt instanceof HTMLFormElement ? detail.elt : detail.elt?.closest("form");
  if (!(form instanceof HTMLFormElement)) return;
  if (!isBrowseForm(form)) return;

  const checkbox = document.querySelector<HTMLInputElement>("[data-sfw-checkbox]");
  if (checkbox) {
    detail.parameters.sfw = String(checkbox.checked);
  }

  const genres = selectedGenreValues();
  if (genres.length > 0) {
    detail.parameters.genres = genres;
    return;
  }

  delete detail.parameters.genres;
};

onReady(() => {
  document.addEventListener("htmx:configRequest", syncBrowseRequestParameters);

  document.addEventListener("htmx:beforeRequest", (event) => {
    setBusy(getTriggerFromHtmxEvent(event), true);
  });

  document.addEventListener("htmx:afterRequest", (event) => {
    setBusy(getTriggerFromHtmxEvent(event), false);

    const remaining = document.querySelectorAll(".continue-watching-item").length;
    if (remaining !== 0) return;

    const section = document.getElementById("continue-watching-section");
    section?.remove();
  });

  document.addEventListener("htmx:responseError", () => {
    toast("Something went wrong");
  });

  document.addEventListener("htmx:afterSwap", (event) => {
    const detail = event as CustomEvent<{ target?: EventTarget | null }>;
    const target = detail.detail?.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("error")) return;
    toast("Failed to load content");
  });

  document.addEventListener("htmx:sendError", () => {
    toast("Network error");
  });

  document.addEventListener("htmx:timeout", () => {
    toast("Request timed out");
  });
});
