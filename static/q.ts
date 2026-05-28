/**
 * querySelector on a container element, scoped to that element.
 */
export const q = <T extends Element>(container: HTMLElement, selector: string): T | null =>
  container.querySelector(selector) as T | null;

/**
 * querySelector on the document.
 */
export const qs = <T extends Element>(selector: string): T | null =>
  document.querySelector(selector) as T | null;

/**
 * Get a data attribute value from an element, defaults to empty string.
 */
export const dataset = (el: HTMLElement, key: string): string => el.dataset[key] ?? "";
