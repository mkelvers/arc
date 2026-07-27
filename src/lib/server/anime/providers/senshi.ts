import type { AudioMode } from '$lib/anime/audio';
import type {
    PlaybackProvider,
    ProviderEpisode,
    ProviderStream,
    ProviderStreams,
} from './types';

const baseUrl = 'https://senshi.live';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

async function request(path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            Accept: 'application/json',
            Referer: `${baseUrl}/`,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
        throw new Error(`Senshi returned ${response.status} for ${path}`);
    }

    return (await response.json()) as unknown;
}

function malId(anime: Parameters<PlaybackProvider['getEpisodes']>[0]) {
    if (!anime.idMal || anime.idMal <= 0) {
        throw new Error(`AniList ${anime.id} has no MAL ID`);
    }

    return anime.idMal;
}

async function getEpisodes(
    anime: Parameters<PlaybackProvider['getEpisodes']>[0],
) {
    const payload = await request(`/episodes/${malId(anime)}`);
    if (!Array.isArray(payload)) {
        throw new Error('Senshi returned an invalid episode inventory');
    }

    const episodes = new Map<number, ProviderEpisode>();
    for (const value of payload) {
        const episode = record(value);
        const number = Number(episode?.ep_id ?? episode?.id);
        if (!Number.isFinite(number) || number <= 0) {
            continue;
        }

        episodes.set(number, {
            id: String(number),
            number,
            title:
                typeof episode?.ep_title === 'string'
                    ? episode.ep_title.trim()
                    : '',
            // The inventory endpoint does not expose per-episode audio.
            // Playback probes sub and dub independently before rendering.
            audio: ['sub'],
        });
    }

    if (!episodes.size) {
        throw new Error(`Senshi has no episodes for MAL ${malId(anime)}`);
    }

    return [...episodes.values()].sort(
        (left, right) => left.number - right.number,
    );
}

function modeForStatus(status: unknown): AudioMode | null {
    if (typeof status !== 'string') {
        return null;
    }

    if (status.toLowerCase() === 'dub') {
        return 'dub';
    }

    return /^(?:hard)?sub$/i.test(status) ? 'sub' : null;
}

async function getStreams(
    anime: Parameters<PlaybackProvider['getStreams']>[0],
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[],
) {
    if (
        !Number.isInteger(episode.number) ||
        episode.number <= 0
    ) {
        throw new Error(
            `Senshi cannot map episode ${episode.id} to an integer`,
        );
    }

    const payload = await request(
        `/episode-embeds/${malId(anime)}/${episode.number}`,
    );
    if (!Array.isArray(payload)) {
        throw new Error('Senshi returned an invalid stream response');
    }

    const requested = new Set(modes);
    const streams: ProviderStreams = {};

    for (const value of payload) {
        const item = record(value);
        const mode = modeForStatus(item?.status);
        const url = item?.url;

        if (
            !mode ||
            !requested.has(mode) ||
            typeof url !== 'string' ||
            !url.startsWith('https://')
        ) {
            continue;
        }

        const stream: ProviderStream = {
            url,
            quality: null,
            audioDelay: 0,
        };
        streams[mode] = [...(streams[mode] ?? []), stream];
    }

    if (!Object.keys(streams).length) {
        throw new Error(
            `Senshi returned no ${modes.join('/')} stream for episode ${episode.id}`,
        );
    }

    return streams;
}

export const senshiProvider: PlaybackProvider = {
    name: 'Senshi',
    getEpisodes,
    getStreams,
};
