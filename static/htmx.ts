export {};

type ToastFn = (opts: { message: string; duration?: number }) => void;

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

const onReady = (fn: () => void): void => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
    return;
  }

  fn();
};

onReady(() => {
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

  document.addEventListener("htmx:sendError", () => {
    toast("Network error");
  });

  document.addEventListener("htmx:timeout", () => {
    toast("Request timed out");
  });
});
