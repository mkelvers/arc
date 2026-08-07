import { asc, desc, eq, lt } from 'drizzle-orm';
import { Effect } from 'effect';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { db } from '$lib/server/db';
import { homeHeroSelection } from '$lib/server/db/schema';
import { getAnime } from './anilist/details';
import { enumLabel, mediaTitle, plainText, present } from './anilist/text';
import { getWeeklyPopularAnime } from './allanime/catalog';
import { getEpisodes } from './episodes';
import { homeHeroSize, selectHomeHero, utcWeekStart } from './home/selection';
import { getArtwork } from './tmdb/artwork';

const requests = new Map<string, Promise<HomeHeroAnime[]>>();

export interface HomeHeroAnime {
  id: number;
  href: string;
  watchHref: string;
  episodeLabel: string;
  title: string;
  image: string;
  logoUrl: string;
  logoSize: number;
  format: string;
  audioLabel: string;
  genres: string[];
  description: string;
}

async function selectionForWeek(weekStart: string) {
  return db
    .select({ anilistId: homeHeroSelection.anilistId })
    .from(homeHeroSelection)
    .where(eq(homeHeroSelection.weekStart, weekStart))
    .orderBy(asc(homeHeroSelection.position))
    .then((rows) => rows.map(({ anilistId }) => anilistId));
}

async function previousSelection(weekStart: string) {
  const [previous] = await db
    .select({ weekStart: homeHeroSelection.weekStart })
    .from(homeHeroSelection)
    .where(lt(homeHeroSelection.weekStart, weekStart))
    .orderBy(desc(homeHeroSelection.weekStart))
    .limit(1);

  return previous ? selectionForWeek(previous.weekStart) : [];
}

async function eligibleHero(id: number): Promise<HomeHeroAnime | null> {
  try {
    const details = await Effect.runPromise(getAnime(id));
    const artwork = await getArtwork(details);

    if (!artwork?.selectedBackdrop || !artwork.selectedLogo) {
      return null;
    }

    const episodes = await getEpisodes(details);
    const firstEpisode = episodes[0];
    if (!firstEpisode) {
      return null;
    }

    return {
      id,
      href: `/anime/${id}`,
      watchHref: firstEpisode.href,
      episodeLabel: firstEpisode.label,
      title: mediaTitle(details),
      image: artwork.selectedBackdrop.url,
      logoUrl: artwork.selectedLogo.url,
      logoSize: artwork.logoSize,
      format: enumLabel(details.format, ''),
      audioLabel: audioAvailabilityLabel([...new Set(episodes.flatMap(({ audio }) => audio))]),
      genres: present(details.genres),
      description: plainText(details.description),
    };
  } catch (cause) {
    console.error(`Homepage hero candidate ${id} failed`, cause);
    return null;
  }
}

async function hydrate(ids: number[]) {
  return selectHomeHero(ids, eligibleHero);
}

async function buildSelection(weekStart: string) {
  const popular = await getWeeklyPopularAnime();
  const selected = await selectHomeHero(
    popular.map(({ anilistId }) => anilistId),
    eligibleHero
  );

  if (selected.length < homeHeroSize) {
    throw new Error(
      `Only ${selected.length} weekly anime had complete hero artwork and an available episode`
    );
  }

  await db
    .insert(homeHeroSelection)
    .values(
      selected.map(({ id }, position) => ({
        weekStart,
        position,
        anilistId: id,
      }))
    )
    .onConflictDoNothing();

  const stored = await selectionForWeek(weekStart);
  const selectedById = new Map(selected.map((anime) => [anime.id, anime]));

  return stored.length === homeHeroSize && stored.every((id) => selectedById.has(id))
    ? stored.map((id) => selectedById.get(id)!)
    : hydrate(stored);
}

async function loadHomeHero(weekStart: string) {
  const stored = await selectionForWeek(weekStart);
  if (stored.length === homeHeroSize) {
    return hydrate(stored);
  }

  try {
    return await buildSelection(weekStart);
  } catch (cause) {
    const previous = await previousSelection(weekStart);
    if (previous.length) {
      console.error(
        `Weekly homepage hero refresh failed; using ${previous.length} previous selections`,
        cause
      );
      return hydrate(previous);
    }

    throw cause;
  }
}

export function getHomeHero(now = new Date()) {
  const weekStart = utcWeekStart(now);
  const active = requests.get(weekStart);
  if (active) {
    return active;
  }

  const request = loadHomeHero(weekStart);
  requests.set(weekStart, request);

  const cleanup = () => {
    if (requests.get(weekStart) === request) {
      requests.delete(weekStart);
    }
  };
  request.then(cleanup, cleanup);

  return request;
}
