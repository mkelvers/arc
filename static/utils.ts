/**
 * Parse a space-separated class list string into an array, filtering empty entries.
 */
export const parseClassList = (value: string | null): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(" ")
    .map((entry: string): string => entry.trim())
    .filter((entry: string): boolean => entry.length > 0);
};

export const onReady = (fn: () => void): void => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
    return;
  }

  fn();
};

export const onHtmxLoad = (fn: (root: Element) => void): void => {
  onReady(() => {
    fn(document.body);
    document.body.addEventListener("htmx:load", (event: Event) => {
      const detail = event as CustomEvent<{ elt?: Element }>;
      const root = detail.detail?.elt;
      if (root instanceof Element) {
        fn(root);
      }
    });
  });
};

export const closestFocusable = (root: ParentNode): HTMLElement | null => {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const node = root.querySelector<HTMLElement>(selector);
  return node instanceof HTMLElement ? node : null;
};
