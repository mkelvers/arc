import { state } from "../state";
import { episodeElements } from "./titles";

type EpisodeClassification = { filler: boolean; number: number; recap: boolean };

export const parseEpisodeClassifications = (value: unknown): EpisodeClassification[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): EpisodeClassification[] => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const candidate = item as { filler?: unknown; number?: unknown; recap?: unknown };
    if (
      typeof candidate.number !== "number" ||
      !Number.isInteger(candidate.number) ||
      candidate.number <= 0 ||
      typeof candidate.filler !== "boolean" ||
      typeof candidate.recap !== "boolean"
    ) {
      return [];
    }
    return [{ filler: candidate.filler, number: candidate.number, recap: candidate.recap }];
  });
};

const updateKindStyles = (element: HTMLElement, classification: EpisodeClassification): void => {
  const filler = classification.filler;
  const recap = !filler && classification.recap;
  element.dataset.filler = String(filler);
  element.dataset.recap = String(recap);

  if (element.dataset.episodeIndex) {
    element.classList.remove(
      "bg-yellow-500/20",
      "text-yellow-400",
      "bg-blue-500/20",
      "text-blue-400",
      "text-foreground-muted",
      "hover:bg-foreground/5",
    );
    if (filler) {
      element.classList.add("bg-yellow-500/20", "text-yellow-400");
    } else if (recap) {
      element.classList.add("bg-blue-500/20", "text-blue-400");
    } else {
      element.classList.add("text-foreground-muted", "hover:bg-foreground/5");
    }
    return;
  }

  const marker = element.querySelector<HTMLElement>("[data-episode-kind-marker]");
  marker?.classList.toggle("hidden", !filler && !recap);
  marker?.classList.toggle("bg-yellow-400", filler);
  marker?.classList.toggle("bg-blue-400", recap);

  const title = element.querySelector<HTMLElement>("[data-episode-title]");
  title?.classList.remove("text-yellow-400", "text-blue-400", "text-foreground-muted");
  if (filler) {
    title?.classList.add("text-yellow-400");
  } else if (recap) {
    title?.classList.add("text-blue-400");
  } else {
    title?.classList.add("text-foreground-muted");
  }
};

export const applyEpisodeClassifications = (classifications: EpisodeClassification[]): void => {
  const byNumber = new Map(classifications.map((episode) => [episode.number, episode]));
  episodeElements().forEach((element) => {
    const number = Number.parseInt(element.dataset.episodeId ?? "", 10);
    const classification = byNumber.get(number);
    if (classification) {
      updateKindStyles(element, classification);
    }
  });
};

export const hydrateEpisodeClassifications = async (signal: AbortSignal): Promise<void> => {
  if (state.episode.malID <= 0) {
    return;
  }
  const response = await fetch(`/api/watch/episodes/${state.episode.malID}/classifications`, {
    signal,
  });
  if (!response.ok) {
    return;
  }
  applyEpisodeClassifications(parseEpisodeClassifications(await response.json()));
};
