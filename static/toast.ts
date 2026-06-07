export {};

interface ToastOptions {
  message: string;
  duration?: number;
}

/** Lazily create and return the toast container element. */
const toastContainer = (): HTMLElement => {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "fixed bottom-4 right-4 z-100 flex flex-col gap-2";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions");
    document.body.appendChild(container);
  }
  return container;
};

/**
 * Show a toast notification with optional auto-dismiss.
 * Exposed globally via window.showToast.
 */
const showToast = ({ message, duration = 3000 }: ToastOptions): void => {
  const container = toastContainer();
  const template = document.getElementById("toast-template") as HTMLTemplateElement | null;

  if (!template) {
    return;
  }

  const toast = (template.content.cloneNode(true) as DocumentFragment)
    .firstElementChild as HTMLElement;
  if (!toast) return;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  const messageEl = toast.querySelector(".toast-message");
  const closeBtn = toast.querySelector(".toast-close");

  if (messageEl) {
    messageEl.textContent = message;
  }

  let removed = false;
  let dismissTimeout: number | undefined;
  let removeTimeout: number | undefined;

  const remove = (): void => {
    if (removed) return;
    removed = true;
    if (typeof dismissTimeout === "number") window.clearTimeout(dismissTimeout);
    if (typeof removeTimeout === "number") window.clearTimeout(removeTimeout);
    toast.remove();
  };

  closeBtn?.addEventListener("click", remove);

  container.appendChild(toast);

  // trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  // auto-dismiss with exit animation
  dismissTimeout = window.setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    removeTimeout = window.setTimeout(remove, 300);
  }, duration);
};

declare global {
  interface Window {
    showToast: typeof showToast;
  }
}

window.showToast = showToast;
