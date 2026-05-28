const dedupe = (): void => {
  const seen = new Set<string>();
  const elements = document.querySelectorAll("[data-id]");

  elements.forEach((item) => {
    const id = item.getAttribute("data-id");
    if (!id) {
      return;
    }
    if (seen.has(id)) {
      item.remove(); // duplicate, remove it
    } else {
      seen.add(id);
    }
  });
};

// run on DOM ready or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", dedupe);
} else {
  dedupe();
}

// also run on load as a fallback (e.g. htmx swaps)
window.addEventListener("load", dedupe);
