import { state } from "../state";

type EpisodeTitle = { number: number; title: string };

const episodeElements = (): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  for (const container of [state.elements.episodeGrid, state.elements.episodeList]) {
    container?.querySelectorAll<HTMLElement>("[data-episode-id]").forEach((element) => {
      elements.push(element);
    });
  }
  return elements;
};

const hasMissingTitles = (): boolean =>
  episodeElements().some((element) => {
    const number = Number.parseInt(element.dataset.episodeId ?? "", 10);
    return number > 0 && element.dataset.episodeTitle?.trim() === `Episode ${number}`;
  });

export const parseEpisodeTitles = (value: unknown): EpisodeTitle[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): EpisodeTitle[] => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const candidate = item as { number?: unknown; title?: unknown };
    if (
      typeof candidate.number !== "number" ||
      !Number.isInteger(candidate.number) ||
      candidate.number <= 0 ||
      typeof candidate.title !== "string" ||
      candidate.title.trim() === ""
    ) {
      return [];
    }
    return [{ number: candidate.number, title: candidate.title.trim() }];
  });
};

export const applyEpisodeTitles = (titles: EpisodeTitle[]): void => {
  const byNumber = new Map(titles.map((episode) => [episode.number, episode.title]));
  episodeElements().forEach((element) => {
    const number = Number.parseInt(element.dataset.episodeId ?? "", 10);
    const title = byNumber.get(number);
    if (!title) {
      return;
    }
    element.dataset.episodeTitle = title;
    const label = element.querySelector<HTMLElement>("[data-episode-title]");
    if (label) {
      label.textContent = title;
    }
  });
};

export const hydrateEpisodeTitles = async (signal: AbortSignal): Promise<void> => {
  if (!hasMissingTitles() || state.episode.malID <= 0) {
    return;
  }

  const response = await fetch(`/api/watch/episodes/${state.episode.malID}/titles`, { signal });
  if (!response.ok) {
    return;
  }
  applyEpisodeTitles(parseEpisodeTitles(await response.json()));
};
