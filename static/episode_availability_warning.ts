import { closestFocusable, onReady } from "./utils";

const initEpisodeAvailabilityWarning = (): void => {
  onReady(() => {
    const dialog = document.querySelector<HTMLElement>("[data-episode-availability-warning]");
    const continueButton = document.querySelector<HTMLButtonElement>(
      "[data-episode-availability-warning-continue]",
    );
    if (!dialog || !continueButton) {
      return;
    }

    document.body.classList.add("overflow-hidden");
    closestFocusable(dialog)?.focus();

    continueButton.addEventListener("click", () => {
      dialog.remove();
      document.body.classList.remove("overflow-hidden");
    });
  });
};

initEpisodeAvailabilityWarning();
