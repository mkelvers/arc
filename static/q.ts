export const q = <T extends Element>(container: HTMLElement, selector: string): T | null =>
  container.querySelector(selector) as T | null;

export const qs = <T extends Element>(selector: string): T | null =>
  document.querySelector(selector) as T | null;

export const dataset = (el: HTMLElement, key: string): string => el.dataset[key] ?? '';
