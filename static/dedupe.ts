import { onHtmxLoad, onReady } from "./utils";

export const dedupeByID = <T>(items: T[], idForItem: (item: T) => string | undefined): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = idForItem(item);
    if (!id) {
      return true;
    }

    if (seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
};

export const dedupeWithin = (root: ParentNode): void => {
  const elements = root.querySelectorAll<HTMLElement>(":scope > [data-id]");
  const uniqueElements = new Set(dedupeByID(Array.from(elements), (item) => item.dataset.id));

  elements.forEach((item) => {
    if (!uniqueElements.has(item)) {
      item.remove();
    }
  });
};

const dedupe = (root: ParentNode = document): void => {
  const containers = new Set<ParentNode>();
  const elements = root.querySelectorAll<HTMLElement>("[data-id]");

  elements.forEach((item) => {
    if (item.parentElement) {
      containers.add(item.parentElement);
    }
  });

  containers.forEach((container) => {
    dedupeWithin(container);
  });
};

const dedupeSwapTarget = (target: EventTarget | null): void => {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.matches("[data-id]")) {
    const parent = target.parentElement;
    if (parent) {
      dedupeWithin(parent);
    }
    return;
  }

  const containers = new Set<ParentNode>();
  const elements = target.querySelectorAll<HTMLElement>("[data-id]");
  elements.forEach((item) => {
    if (item.parentElement) {
      containers.add(item.parentElement);
    }
  });

  containers.forEach((container) => {
    dedupeWithin(container);
  });
};

onReady(() => dedupe());
window.addEventListener("load", () => dedupe());
onHtmxLoad((root) => dedupeSwapTarget(root));
