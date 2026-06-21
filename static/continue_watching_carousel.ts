import { onHtmxLoad, onReady } from "./utils";

const carouselScrollEpsilon = 2;
const fallbackCarouselOverlap = 96;
const itemOverlapRatio = 0.45;
const minimumArrowItems = 5;

type ContinueWatchingCarousel = {
  track: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  previousFade: HTMLElement;
  nextFade: HTMLElement;
};

const getContinueWatchingCarousel = (root: HTMLElement): ContinueWatchingCarousel | null => {
  const track = root.querySelector<HTMLElement>("[data-continue-watching-track]");
  const previous = root.querySelector<HTMLButtonElement>("[data-continue-watching-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-continue-watching-next]");
  const previousFade = root.querySelector<HTMLElement>("[data-continue-watching-prev-fade]");
  const nextFade = root.querySelector<HTMLElement>("[data-continue-watching-next-fade]");

  if (!track || !previous || !next || !previousFade || !nextFade) {
    return null;
  }

  return { track, previous, next, previousFade, nextFade };
};

const continueWatchingCarousels = (root: ParentNode = document): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>("[data-continue-watching-carousel]"),
];

const maxScrollLeft = (track: HTMLElement): number =>
  Math.max(0, track.scrollWidth - track.clientWidth);

const setControlState = (button: HTMLButtonElement, fade: HTMLElement, visible: boolean): void => {
  button.classList.toggle("hidden", !visible);
  button.classList.toggle("inline-flex", visible);
  button.setAttribute("aria-hidden", String(!visible));
  button.tabIndex = visible ? 0 : -1;
  fade.classList.toggle("hidden", !visible);
};

const updateContinueWatchingCarousel = (root: HTMLElement): void => {
  const carousel = getContinueWatchingCarousel(root);
  if (!carousel) {
    return;
  }

  const items = carousel.track.querySelectorAll("[data-continue-watching-item]");
  const maxScroll = maxScrollLeft(carousel.track);
  const canScroll = maxScroll > carouselScrollEpsilon;
  const allowArrows = canScroll && items.length >= minimumArrowItems;
  const hasPrevious = allowArrows && carousel.track.scrollLeft > carouselScrollEpsilon;
  const hasNext = allowArrows && carousel.track.scrollLeft < maxScroll - carouselScrollEpsilon;

  setControlState(carousel.previous, carousel.previousFade, hasPrevious);
  setControlState(carousel.next, carousel.nextFade, hasNext);
};

const updateContinueWatchingCarousels = (root: ParentNode = document): void => {
  continueWatchingCarousels(root).forEach(updateContinueWatchingCarousel);
};

const carouselScrollAmount = (track: HTMLElement): number => {
  const firstItem = track.querySelector<HTMLElement>("[data-continue-watching-item]");
  if (!firstItem) {
    return Math.max(160, track.clientWidth - fallbackCarouselOverlap);
  }

  const itemWidth = firstItem.getBoundingClientRect().width;
  const overlap = Math.max(fallbackCarouselOverlap, itemWidth * itemOverlapRatio);

  return Math.max(itemWidth, track.clientWidth - Math.min(itemWidth, overlap));
};

const scrollContinueWatchingCarousel = (root: HTMLElement, direction: -1 | 1): void => {
  const carousel = getContinueWatchingCarousel(root);
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
    updateContinueWatchingCarousel(root);
  }, 350);
};

document.addEventListener(
  "click",
  (event: MouseEvent): void => {
    const { target } = event;
    if (!(target instanceof Element)) {
      return;
    }

    const previous = target.closest("[data-continue-watching-prev]");
    if (previous) {
      event.preventDefault();
      event.stopPropagation();
      const root = previous.closest<HTMLElement>("[data-continue-watching-carousel]");
      if (root) {
        scrollContinueWatchingCarousel(root, -1);
      }
      return;
    }

    const next = target.closest("[data-continue-watching-next]");
    if (!next) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const root = next.closest<HTMLElement>("[data-continue-watching-carousel]");
    if (root) {
      scrollContinueWatchingCarousel(root, 1);
    }
  },
  true,
);

document.addEventListener(
  "scroll",
  (event: Event): void => {
    const { target } = event;
    if (!(target instanceof HTMLElement) || !target.matches("[data-continue-watching-track]")) {
      return;
    }

    const root = target.closest<HTMLElement>("[data-continue-watching-carousel]");
    if (root) {
      updateContinueWatchingCarousel(root);
    }
  },
  true,
);

onReady(() => {
  updateContinueWatchingCarousels();
});
onHtmxLoad((root) => {
  updateContinueWatchingCarousels(root);
});
window.addEventListener("resize", () => {
  updateContinueWatchingCarousels();
});
