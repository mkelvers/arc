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
    return requestUrl(new URL(path, baseUrl));
}

async function requestUrl(url: URL) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            Referer: `${baseUrl}/`,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
        throw new Error(
            `Senshi returned ${response.status} for ${url.pathname}`,
        );
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

function safeUrl(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function subtitleManifest(item: Record<string, unknown>) {
    const server = safeUrl(item.serverFM);
    const fromServer = safeUrl(server?.searchParams.get('sub.info'));
    const masked = safeUrl(item.masked_base_url);
    const manifest =
        fromServer ??
        (masked
            ? new URL(
                  'sub_filemoon.json',
                  `${masked.toString().replace(/\/?$/, '/')}`,
              )
            : null);

    return manifest &&
        manifest.protocol === 'https:' &&
        (manifest.hostname === 'ninstream.com' ||
            manifest.hostname.endsWith('.ninstream.com')) &&
        manifest.pathname.endsWith('.json')
        ? manifest
        : null;
}

function subtitleTrack(value: unknown) {
    if (!Array.isArray(value)) {
        return null;
    }

    const tracks = value.flatMap((item) => {
        const track = record(item);
        const url = safeUrl(track?.src);
        if (
            !url ||
            url.protocol !== 'https:' ||
            !url.pathname.toLowerCase().endsWith('.vtt') ||
            !(
                url.hostname === 'ninjstream.xyz' ||
                url.hostname.endsWith('.ninjstream.xyz') ||
                url.hostname === 'ninstream.com' ||
                url.hostname.endsWith('.ninstream.com')
            )
        ) {
            return [];
        }

        return [
            {
                url: url.toString(),
                label:
                    typeof track?.label === 'string'
                        ? track.label.toLowerCase()
                        : '',
                preferred: track?.default === true,
            },
        ];
    });
    const dialogue = tracks.filter(
        ({ label }) => !/forced|sign|song/.test(label),
    );

    return (
        dialogue.find(({ preferred }) => preferred) ??
        dialogue.find(({ label }) => /eng|english/.test(label)) ??
        tracks.find(({ preferred }) => preferred) ??
        tracks.find(({ label }) => /eng|english/.test(label)) ??
        tracks[0] ??
        null
    )?.url;
}

async function senshiSubtitle(item: Record<string, unknown>) {
    const manifest = subtitleManifest(item);
    if (!manifest) {
        return null;
    }

    try {
        return subtitleTrack(await requestUrl(manifest));
    } catch {
        return null;
    }
}

async function getStreams(
    anime: Parameters<PlaybackProvider['getStreams']>[0],
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[],
) {
    if (!Number.isInteger(episode.number) || episode.number <= 0) {
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
        if (!item) {
            continue;
        }
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
            subtitleUrl: mode === 'sub' ? await senshiSubtitle(item) : null,
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
