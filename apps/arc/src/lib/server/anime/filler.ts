import { load } from 'cheerio';

import type { EpisodeType } from '$lib/types';
import type { AniListAnime } from './anilist/types';
import type { ProviderEpisode } from './providers/types';

type FillerClassification = Exclude<EpisodeType, 'recap' | 'unknown'>;
type FillerRequest = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function mergeFillerClassifications(
    episodes: readonly ProviderEpisode[],
    classifications: ReadonlyMap<number, FillerClassification>
): ProviderEpisode[] {
    return episodes.map((episode) => {
        const classification = classifications.get(episode.number);
        if (!classification) {
            return episode;
        }

        const type: ProviderEpisode['type'] =
            classification === 'filler' || episode.type === 'filler'
                ? 'filler'
                : episode.type === 'recap'
                  ? 'recap'
                  : classification;

        return {
            ...episode,
            type,
        };
    });
}

async function fetchHtml(url: string, request: FillerRequest) {
    const response = await request(url, {
        headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'Arc/1.0',
        },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
        throw new Error(`AnimeFillerList returned HTTP ${response.status}`);
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
        throw new Error('AnimeFillerList returned a non-HTML response');
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) {
        throw new Error('AnimeFillerList response exceeded 2 MiB');
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > 2 * 1024 * 1024) {
        throw new Error('AnimeFillerList response exceeded 2 MiB');
    }

    return new TextDecoder().decode(body);
}

function normalizedTitle(title: string) {
    return title
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('en')
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

export async function getFillerClassifications(
    anime: AniListAnime,
    providerEpisodes: readonly ProviderEpisode[],
    request: FillerRequest = fetch
) {
    if (!anime.idMal) {
        return new Map<number, FillerClassification>();
    }

    const titles = new Set(
        [anime.title?.english, anime.title?.romaji, anime.title?.native, ...(anime.synonyms ?? [])]
            .filter((title): title is string => Boolean(title?.trim()))
            .map(normalizedTitle)
    );
    if (!titles.size) {
        return new Map<number, FillerClassification>();
    }

    const index = load(await fetchHtml('https://www.animefillerlist.com/shows', request));
    const matches = index('#ShowList a[href^="/shows/"]')
        .toArray()
        .flatMap((link) => {
            const href = index(link).attr('href');
            if (!href || !/^\/shows\/[A-Za-z0-9%._~-]+$/.test(href)) {
                return [];
            }

            return titles.has(normalizedTitle(index(link).text())) ? [href] : [];
        });
    const uniqueMatches = [...new Set(matches)];
    if (uniqueMatches.length !== 1) {
        return new Map<number, FillerClassification>();
    }

    const page = load(
        await fetchHtml(`https://www.animefillerlist.com${uniqueMatches[0]}`, request)
    );
    const pageTitle = page('h1')
        .first()
        .text()
        .replace(/\s+Filler List\s*$/i, '');
    if (!titles.has(normalizedTitle(pageTitle))) {
        return new Map<number, FillerClassification>();
    }

    const classifications = new Map<number, FillerClassification>();
    for (const row of page('table.EpisodeList tbody tr').toArray()) {
        const number = Number(page(row).find('td.Number').first().text().trim());
        if (!Number.isSafeInteger(number) || number < 1 || number > 10_000) {
            return new Map<number, FillerClassification>();
        }

        const type = page(row).find('td.Type span').first().text().trim();
        const classification =
            type === 'Manga Canon'
                ? 'canon'
                : type === 'Mixed Canon/Filler'
                  ? 'mixed'
                  : type === 'Filler'
                    ? 'filler'
                    : type === 'Anime Canon'
                      ? 'anime-canon'
                      : null;
        if (classification) {
            classifications.set(number, classification);
        }
    }

    if (
        !classifications.size ||
        classifications.size !== page('table.EpisodeList tbody tr').length
    ) {
        return new Map<number, FillerClassification>();
    }
    if (anime.status === 'FINISHED' && anime.episodes && classifications.size !== anime.episodes) {
        return new Map<number, FillerClassification>();
    }
    if (
        providerEpisodes.some(
            ({ number }) =>
                Number.isSafeInteger(number) && number > 0 && !classifications.has(number)
        )
    ) {
        return new Map<number, FillerClassification>();
    }

    return classifications;
}
