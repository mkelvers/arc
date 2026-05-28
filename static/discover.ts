import { parseClassList } from "./utils";

const setActiveDiscoverTab = (clickedTab: Element): void => {
  const group = clickedTab.closest('[data-tab-group="discover"]');
  if (!group) {
    return;
  }

  // reset all tabs in group
  const triggers = group.querySelectorAll("[data-tab-trigger]");
  triggers.forEach((tab) => {
    const activeClasses = parseClassList(tab.getAttribute("data-tab-active-classes"));
    const inactiveClasses = parseClassList(tab.getAttribute("data-tab-inactive-classes"));
    tab.classList.remove(...activeClasses);
    tab.classList.add(...inactiveClasses);
  });

  // mark clicked tab as active
  const activeClasses = parseClassList(clickedTab.getAttribute("data-tab-active-classes"));
  const inactiveClasses = parseClassList(clickedTab.getAttribute("data-tab-inactive-classes"));
  clickedTab.classList.remove(...inactiveClasses);
  clickedTab.classList.add(...activeClasses);
};

const onDiscoverTabClick = (event: MouseEvent): void => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const trigger = target.closest("[data-tab-trigger]");
  if (!trigger) {
    return;
  }

  setActiveDiscoverTab(trigger);
};

const initDiscoverTabs = (): void => {
  document.addEventListener("click", onDiscoverTabClick);
};

initDiscoverTabs();

const initSurpriseMe = (): void => {
  let isFetchingRandom = false;

  const onClick = async (): Promise<void> => {
    if (isFetchingRandom) return;

    const btn = document.getElementById("surprise-btn") as HTMLButtonElement | null;
    if (!btn) return;
    isFetchingRandom = true;

    const spinner = document.getElementById("surprise-spinner");
    const text = document.getElementById("surprise-text");
    const icon = document.getElementById("surprise-icon");

    btn.disabled = true;
    spinner?.classList.remove("hidden");
    icon?.classList.add("hidden");
    if (text) text.textContent = "Picking…";

    try {
      const res = await fetch(`/api/jikan/random/anime?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch random anime");
      const json = (await res.json()) as unknown;
      const data = (json as { data?: unknown }).data as { mal_id?: unknown } | undefined;
      const malId = typeof data?.mal_id === "number" ? data.mal_id : 0;
      if (malId > 0) {
        window.location.href = `/anime/${malId}`;
        return;
      }
      throw new Error("Random anime missing mal_id");
    } catch (error) {
      console.error(error);
      alert("Could not pick a random anime right now. Please try again.");
    } finally {
      isFetchingRandom = false;
      btn.disabled = false;
      spinner?.classList.add("hidden");
      icon?.classList.remove("hidden");
      if (text) text.textContent = "Surprise Me";
    }
  };

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const surprise = target.closest("[data-surprise-me]");
    if (!surprise) return;
    void onClick();
  });
};

initSurpriseMe();
