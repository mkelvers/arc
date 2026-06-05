const dedupeWithin = (root: ParentNode): void => {
  const seen = new Set<string>();
  const elements = root.querySelectorAll<HTMLElement>(":scope > [data-id]");

  elements.forEach((item) => {
    const id = item.dataset.id;
    if (!id) {
      return;
    }

    if (seen.has(id)) {
      item.remove();
      return;
    }

    seen.add(id);
  });
};

const dedupe = (): void => {
  const containers = new Set<ParentNode>();
  const elements = document.querySelectorAll<HTMLElement>("[data-id]");

  elements.forEach((item) => {
    if (item.parentElement) {
      containers.add(item.parentElement);
    }
  });

  containers.forEach((container) => {
    dedupeWithin(container);
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", dedupe);
} else {
  dedupe();
}

window.addEventListener("load", dedupe);
