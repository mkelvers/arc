const carouselScrollEpsilon = 2;
const fallbackCarouselOverlap = 96;
const itemOverlapRatio = 0.45;

type TopPickCarousel = {
  track: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  previousFade: HTMLElement;
  nextFade: HTMLElement;
};

const getTopPickCarousel = (root: HTMLElement): TopPickCarousel | null => {
  const track = root.querySelector<HTMLElement>("[data-top-pick-track]");
  const previous = root.querySelector<HTMLButtonElement>("[data-top-pick-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-top-pick-next]");
  const previousFade = root.querySelector<HTMLElement>("[data-top-pick-prev-fade]");
  const nextFade = root.querySelector<HTMLElement>("[data-top-pick-next-fade]");

  if (!track || !previous || !next || !previousFade || !nextFade) {
    return null;
  }

  return { track, previous, next, previousFade, nextFade };
};

const topPickCarousels = (root: ParentNode = document): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>("[data-top-pick-carousel]"),
];

const maxScrollLeft = (track: HTMLElement): number =>
  Math.max(0, track.scrollWidth - track.clientWidth);

const updateTopPickCarousel = (root: HTMLElement): void => {
  const carousel = getTopPickCarousel(root);
  if (!carousel) {
    return;
  }

  const maxScroll = maxScrollLeft(carousel.track);
  const canScroll = maxScroll > carouselScrollEpsilon;
  const hasPrevious = canScroll && carousel.track.scrollLeft > carouselScrollEpsilon;
  const hasNext = canScroll && carousel.track.scrollLeft < maxScroll - carouselScrollEpsilon;

  carousel.previous.disabled = false;
  carousel.next.disabled = false;
  carousel.previous.classList.toggle("hidden", !hasPrevious);
  carousel.previous.classList.toggle("inline-flex", hasPrevious);
  carousel.previous.setAttribute("aria-hidden", String(!hasPrevious));
  carousel.previous.tabIndex = hasPrevious ? 0 : -1;
  carousel.previousFade.classList.toggle("hidden", !hasPrevious);

  carousel.next.classList.toggle("hidden", !hasNext);
  carousel.next.classList.toggle("inline-flex", hasNext);
  carousel.next.setAttribute("aria-hidden", String(!hasNext));
  carousel.next.tabIndex = hasNext ? 0 : -1;
  carousel.nextFade.classList.toggle("hidden", !hasNext);
};

const updateTopPickCarousels = (root: ParentNode = document): void => {
  topPickCarousels(root).forEach(updateTopPickCarousel);
};

const scheduleTopPickCarouselUpdate = (root: ParentNode = document): void => {
  updateTopPickCarousels(root);
  window.requestAnimationFrame(() => {
    updateTopPickCarousels(root);
  });
};

const carouselScrollAmount = (track: HTMLElement): number => {
  const firstItem = track.querySelector<HTMLElement>("[data-top-pick-item]");
  if (!firstItem) {
    return Math.max(160, track.clientWidth - fallbackCarouselOverlap);
  }

  const itemWidth = firstItem.getBoundingClientRect().width;
  const overlap = Math.max(fallbackCarouselOverlap, itemWidth * itemOverlapRatio);

  return Math.max(itemWidth, track.clientWidth - Math.min(itemWidth, overlap));
};

const scrollTopPickCarousel = (root: HTMLElement, direction: -1 | 1): void => {
  const carousel = getTopPickCarousel(root);
  if (!carousel) {
    return;
  }

  const currentScroll = carousel.track.scrollLeft;
  const targetScroll =
    direction < 0
      ? Math.max(0, currentScroll - carouselScrollAmount(carousel.track))
      : Math.min(
          maxScrollLeft(carousel.track),
          currentScroll + carouselScrollAmount(carousel.track),
        );

  carousel.track.scrollTo({ left: targetScroll, behavior: "smooth" });

  window.setTimeout(() => {
    updateTopPickCarousel(root);
  }, 350);
};

document.addEventListener(
  "click",
  (event: MouseEvent): void => {
    const { target } = event;
    if (!(target instanceof Element)) {
      return;
    }

    const previous = target.closest("[data-top-pick-prev]");
    if (previous) {
      event.preventDefault();
      event.stopPropagation();
      const root = previous.closest<HTMLElement>("[data-top-pick-carousel]");
      if (root) {
        scrollTopPickCarousel(root, -1);
      }
      return;
    }

    const next = target.closest("[data-top-pick-next]");
    if (!next) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const root = next.closest<HTMLElement>("[data-top-pick-carousel]");
    if (root) {
      scrollTopPickCarousel(root, 1);
    }
  },
  true,
);

document.addEventListener(
  "scroll",
  (event: Event): void => {
    const { target } = event;
    if (!(target instanceof HTMLElement) || !target.matches("[data-top-pick-track]")) {
      return;
    }

    const root = target.closest<HTMLElement>("[data-top-pick-carousel]");
    if (root) {
      updateTopPickCarousel(root);
    }
  },
  true,
);

onReady(() => {
  scheduleTopPickCarouselUpdate();
});
onHtmxLoad((root) => {
  scheduleTopPickCarouselUpdate(root);
});
window.addEventListener("resize", () => {
  scheduleTopPickCarouselUpdate();
});
import { onHtmxLoad, onReady } from "./utils";
