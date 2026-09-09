import { z } from 'zod';
import { AniListAnimeSchema } from './anilist-types';

const identifierSchema = z.object({ type: z.string(), id: z.string().regex(/^[1-9]\d*$/) });
const resourceSchema = identifierSchema.extend({
    attributes: z.record(z.string(), z.unknown()),
    relationships: z
        .record(
            z.string(),
            z.object({
                data: z.union([identifierSchema, z.array(identifierSchema), z.null()]).optional(),
            })
        )
        .default({}),
});
const pageSchema = z.object({
    data: z.array(resourceSchema),
    included: z.array(resourceSchema).default([]),
    links: z.object({ next: z.string().nullish() }).optional(),
});
type Resource = z.infer<typeof resourceSchema>;
const animeAttributesSchema = z.object({
    canonicalTitle: z.string().min(1),
    titles: z.object({
        en: z.string().nullish(),
        en_jp: z.string().nullish(),
        ja_jp: z.string().nullish(),
    }),
    abbreviatedTitles: z.array(z.string()).nullish(),
    description: z.string().nullish(),
    synopsis: z.string().nullish(),
    subtype: z.enum(['TV', 'movie', 'OVA', 'ONA', 'special', 'music']),
    status: z.enum(['current', 'finished', 'tba', 'unreleased', 'upcoming']),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullish(),
    endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullish(),
    episodeCount: z.number().int().nonnegative().nullish(),
    episodeLength: z.number().int().nonnegative().nullish(),
    averageRating: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .transform(Number)
        .pipe(z.number().min(0).max(100))
        .nullish(),
    userCount: z.number().int().nonnegative().nullish(),
    favoritesCount: z.number().int().nonnegative().nullish(),
    posterImage: z.object({ original: z.url().nullish(), large: z.url().nullish() }).nullish(),
    coverImage: z.object({ original: z.url().nullish() }).nullish(),
    nsfw: z.boolean(),
});

// JSON:API relationships must be joined by both type and ID, never array position.
function related(resource: Resource, name: string, resources: Map<string, Resource>) {
    const data = resource.relationships[name]?.data;
    const identifiers = Array.isArray(data) ? data : data ? [data] : [];
    return identifiers.map(({ type, id }) => {
        const included = resources.get(`${type}:${id}`);
        if (!included) throw new Error(`Kitsu omitted included ${type}:${id}`);
        return included;
    });
}

function externalId(resource: Resource, site: string, resources: Map<string, Resource>) {
    const ids = new Set(
        related(resource, 'mappings', resources)
            .filter((mapping) => mapping.attributes.externalSite === site)
            .map((mapping) =>
                z
                    .string()
                    .regex(/^[1-9]\d*$/)
                    .transform(Number)
                    .pipe(z.number().int().positive().safe())
                    .parse(mapping.attributes.externalId)
            )
    );
    // Community mappings can be incomplete or conflicting. Never guess an Arc route ID.
    if (ids.size !== 1) return null;
    return [...ids][0] ?? null;
}

function fuzzyDate(value: string | null | undefined) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    return { year: year ?? null, month: month ?? null, day: day ?? null };
}

function normalize(resource: Resource, resources: Map<string, Resource>) {
    const id = externalId(resource, 'anilist/anime', resources);
    if (resource.type !== 'anime' || id === null) return null;
    const attributes = animeAttributesSchema.parse(resource.attributes);
    const startDate = fuzzyDate(attributes.startDate);
    const relations = related(resource, 'mediaRelationships', resources).flatMap((relation) => {
        const destination = related(relation, 'destination', resources)[0];
        if (!destination || destination.type !== 'anime') return [];
        const destinationId = externalId(destination, 'anilist/anime', resources);
        if (destinationId === null) return [];
        const destinationAttributes = animeAttributesSchema.parse(destination.attributes);
        const role = z
            .enum([
                'sequel',
                'prequel',
                'alternative_setting',
                'alternative_version',
                'side_story',
                'parent_story',
                'summary',
                'full_story',
                'spinoff',
                'adaptation',
                'character',
                'other',
            ])
            .parse(relation.attributes.role);
        return [
            {
                relationType:
                    new Map([
                        ['alternative_setting', 'ALTERNATIVE'],
                        ['alternative_version', 'ALTERNATIVE'],
                        ['parent_story', 'PARENT'],
                        ['spinoff', 'SPIN_OFF'],
                        ['full_story', 'OTHER'],
                    ]).get(role) ?? role.toUpperCase(),
                node: {
                    id: destinationId,
                    idMal: externalId(destination, 'myanimelist/anime', resources),
                    type: 'ANIME',
                    format: destinationAttributes.subtype.toUpperCase(),
                    episodes: destinationAttributes.episodeCount || null,
                    title: {
                        english: destinationAttributes.titles.en ?? null,
                        romaji:
                            destinationAttributes.titles.en_jp ??
                            destinationAttributes.canonicalTitle,
                        native: destinationAttributes.titles.ja_jp ?? null,
                    },
                },
            },
        ];
    });
    return {
        ...AniListAnimeSchema.parse({
            id,
            idMal: externalId(resource, 'myanimelist/anime', resources),
            metadataSource: 'kitsu',
            metadataSourceId: Number(resource.id),
            title: {
                english: attributes.titles.en ?? null,
                romaji: attributes.titles.en_jp ?? attributes.canonicalTitle,
                native: attributes.titles.ja_jp ?? null,
            },
            synonyms: attributes.abbreviatedTitles ?? [],
            coverImage: {
                extraLarge: attributes.posterImage?.original ?? null,
                large: attributes.posterImage?.large ?? null,
            },
            bannerImage: attributes.coverImage?.original ?? null,
            description: attributes.description ?? attributes.synopsis ?? null,
            genres: related(resource, 'genres', resources).map((genre) =>
                z.string().parse(genre.attributes.name)
            ),
            format: attributes.subtype.toUpperCase(),
            status:
                attributes.status === 'current'
                    ? 'RELEASING'
                    : attributes.status === 'finished'
                      ? 'FINISHED'
                      : 'NOT_YET_RELEASED',
            season: startDate?.month
                ? ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor((startDate.month - 1) / 3)]
                : null,
            seasonYear: startDate?.year ?? null,
            startDate,
            endDate: fuzzyDate(attributes.endDate),
            episodes: attributes.episodeCount || null,
            duration: attributes.episodeLength || null,
            // Kitsu nextRelease does not identify an episode. It cannot supply an airing event.
            nextAiringEpisode: null,
            relations: { edges: relations },
            averageScore: attributes.averageRating ?? null,
            popularity: attributes.userCount ?? null,
            favourites: attributes.favoritesCount ?? null,
            rankings: null,
            tags: null,
            studios: {
                nodes: related(resource, 'productions', resources)
                    .filter((production) => production.attributes.role === 'studio')
                    .flatMap((production) => related(production, 'company', resources))
                    .map((company) => ({ name: z.string().parse(company.attributes.name) })),
            },
            staff: {
                edges: related(resource, 'staff', resources).flatMap((staff) =>
                    z
                        .string()
                        .parse(staff.attributes.role)
                        .split(',')
                        .map((role) => ({
                            role: role.trim(),
                            node: {
                                name: {
                                    full: z
                                        .string()
                                        .parse(
                                            related(staff, 'person', resources)[0]?.attributes.name
                                        ),
                                },
                            },
                        }))
                ),
            },
        }),
        isAdult: attributes.nsfw,
        source: null,
        countryOfOrigin: null,
    };
}

const variablesSchema = z.object({
    id: z.number().int().positive().optional(),
    ids: z.array(z.number().int().positive()).max(50).optional(),
    malIds: z.array(z.number().int().positive()).max(50).nullish(),
    page: z.number().int().positive().default(1),
    perPage: z.number().int().min(1).max(50).default(50),
    search: z.string().optional(),
    genre: z.string().optional(),
    tag: z.string().optional(),
    format: z.string().optional(),
    discoveryFormats: z.array(z.string()).optional(),
    status: z.string().optional(),
    source: z.string().optional(),
    countryOfOrigin: z.string().optional(),
    season: z.string().optional(),
    seasonYear: z.number().int().optional(),
    isAdult: z.boolean().optional(),
    sort: z.array(z.string()).optional(),
    minimumPopularity: z.number().optional(),
});

// Kitsu's rate limit applies to the process's outgoing requests, across catalog operations.
let blockedUntil = 0;

/** Translate Arc's supported catalog operations using Kitsu's first-party JSON:API. */
export async function requestKitsu<Variables>(
    operation: string,
    variables: Variables,
    timeoutMs = 12_000
) {
    // These operations require AniList-only taxonomy, trends or precise airing timestamps.
    if (
        ![
            'Anime',
            'AnimeOverview',
            'WatchlistAnime',
            'DiscoveryAnime',
            'FranchiseMedia',
            'WatchlistTransferAnime',
            'SearchAnimePage',
            'BrowseAnimePage',
            'HomeAnime',
        ].includes(operation)
    ) {
        throw new Error(`Kitsu cannot faithfully answer ${operation}`);
    }
    const input = variablesSchema.parse(variables);
    if (Date.now() < blockedUntil) throw new Error('Kitsu is rate limited');
    if (['Anime', 'AnimeOverview'].includes(operation) && input.id === undefined)
        throw new Error('Kitsu requires an AniList ID');
    if (['WatchlistAnime', 'DiscoveryAnime'].includes(operation) && !input.ids)
        throw new Error('Kitsu requires AniList IDs');
    if (['FranchiseMedia', 'WatchlistTransferAnime'].includes(operation) && !input.malIds)
        throw new Error('Kitsu requires MAL IDs');
    if (
        (input.format ? [input.format] : (input.discoveryFormats ?? [])).some(
            (format) => !['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'].includes(format)
        )
    )
        throw new Error('Kitsu cannot apply the requested format');
    if (input.tag || input.source || input.countryOfOrigin) {
        throw new Error('Kitsu cannot apply AniList tag, source or country filters');
    }
    const signal = AbortSignal.timeout(timeoutMs);
    const resources = new Map<string, Resource>();
    let requests = 0;
    async function page(path: string, parameters: Record<string, string>) {
        if (++requests > 40) throw new Error('Kitsu fallback exceeded its request budget');
        const url = new URL(`https://kitsu.app/api/edge/${path}`);
        url.search = new URLSearchParams(parameters).toString();
        const response = await fetch(url, {
            headers: { Accept: 'application/vnd.api+json', 'User-Agent': 'Arc/0.1' },
            signal,
        });
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const delay =
                retryAfter && /^\d+(\.\d+)?$/.test(retryAfter)
                    ? Number(retryAfter) * 1_000
                    : retryAfter
                      ? Date.parse(retryAfter) - Date.now()
                      : 60_000;
            blockedUntil = Date.now() + (Number.isFinite(delay) ? Math.max(1_000, delay) : 60_000);
        }
        if (!response.ok) throw new Error(`Kitsu request failed with ${response.status}`);
        const result = pageSchema.parse(await response.json());
        for (const resource of [...result.included, ...result.data]) {
            const stored = resources.get(`${resource.type}:${resource.id}`);
            if (stored) {
                for (const [name, relationship] of Object.entries(stored.relationships)) {
                    if (resource.relationships[name]?.data === undefined)
                        resource.relationships[name] = relationship;
                }
            }
            resources.set(`${resource.type}:${resource.id}`, resource);
        }
        return result;
    }
    async function loadAnime(ids: string[], details: boolean) {
        const anime: Resource[] = [];
        for (let index = 0; index < ids.length; index += 20) {
            const result = await page('anime', {
                'filter[id]': ids.slice(index, index + 20).join(','),
                'page[limit]': '20',
                include: details
                    ? 'mappings,genres,mediaRelationships.destination,staff.person,productions.company'
                    : 'mappings',
            });
            const requested = new Set(ids.slice(index, index + 20));
            if (
                result.links?.next ||
                result.data.some((entry) => entry.type !== 'anime' || !requested.has(entry.id))
            )
                throw new Error('Kitsu returned an unexpected anime batch');
            anime.push(...result.data);
        }
        return anime;
    }
    async function resolveIds(ids: number[], site: string, allowMissing = false) {
        if (!ids.length) return [];
        const mappings: Resource[] = [];
        for (let offset = 0; ; offset += 20) {
            const result = await page('mappings', {
                'filter[externalSite]': site,
                'filter[externalId]': ids.join(','),
                include: 'item',
                'page[limit]': '20',
                'page[offset]': String(offset),
            });
            mappings.push(...result.data);
            if (!result.links?.next) break;
        }
        const resolvedIds = ids.flatMap((id) => {
            const matches = mappings.filter(
                (mapping) =>
                    mapping.type === 'mappings' &&
                    mapping.attributes.externalSite === site &&
                    mapping.attributes.externalId === String(id)
            );
            const destinations = new Set(
                matches.flatMap((mapping) => {
                    const item = mapping.relationships.item?.data;
                    return item && !Array.isArray(item) && item.type === 'anime' ? [item.id] : [];
                })
            );
            if (destinations.size !== 1) {
                if (allowMissing) return [];
                throw new Error(`Kitsu has no unambiguous ${site} mapping for ${id}`);
            }
            return [{ externalId: id, kitsuId: [...destinations][0]! }];
        });
        const anime = await loadAnime(
            [...new Set(resolvedIds.map(({ kitsuId }) => kitsuId))],
            true
        );
        await completeRelations(anime);
        const results = anime.map((entry) => normalize(entry, resources));
        // Check both directions. Never substitute a Kitsu or MAL number for an AniList ID.
        return resolvedIds.flatMap(({ externalId: id }) => {
            const matches = results.filter(
                (entry) => entry && (site === 'anilist/anime' ? entry.id : entry.idMal) === id
            );
            if (matches.length !== 1 || !matches[0]) {
                if (allowMissing) return [];
                throw new Error(`Kitsu returned conflicting metadata for ${site}:${id}`);
            }
            return [matches[0]];
        });
    }
    async function completeRelations(anime: Resource[]) {
        const destinations = [
            ...new Set(
                anime.flatMap((entry) =>
                    related(entry, 'mediaRelationships', resources)
                        .flatMap((relation) => related(relation, 'destination', resources))
                        .filter(
                            (entry) =>
                                entry.type === 'anime' &&
                                entry.relationships.mappings?.data === undefined
                        )
                        .map((entry) => entry.id)
                )
            ),
        ];
        await loadAnime(destinations, false);
    }
    // Resolve relationships in one batch, not one request per related title.
    if (input.id !== undefined || input.ids !== undefined || input.malIds != null) {
        const ids = input.id !== undefined ? [input.id] : (input.ids ?? input.malIds ?? []);
        const site = input.malIds != null ? 'myanimelist/anime' : 'anilist/anime';
        const media = await resolveIds(ids, site, operation === 'FranchiseMedia');
        const completed = media.filter((entry) => {
            if (
                (['WatchlistAnime', 'DiscoveryAnime'].includes(operation) ||
                    input.isAdult === false) &&
                entry.isAdult
            )
                return false;
            if (input.format && entry.format !== input.format) return false;
            if (
                input.discoveryFormats &&
                (!entry.format || !input.discoveryFormats.includes(entry.format))
            )
                return false;
            if (input.status && entry.status !== input.status) return false;
            if (input.season && entry.season !== input.season) return false;
            if (input.seasonYear && entry.seasonYear !== input.seasonYear) return false;
            if (input.genre && !entry.genres?.includes(input.genre)) return false;
            return (
                input.minimumPopularity == null || (entry.popularity ?? 0) > input.minimumPopularity
            );
        });
        if (input.id !== undefined) return { Media: completed[0] ?? null };
        return {
            [operation === 'WatchlistTransferAnime' ? 'mal' : 'Page']: {
                media: completed,
                pageInfo: { hasNextPage: false },
            },
        };
    }
    async function catalog(
        parameters: Record<string, string>,
        requestedPage: number,
        perPage: number,
        safe: boolean,
        withRelations: boolean
    ) {
        const anime: Resource[] = [];
        let hasNextPage = false;
        for (let offset = (requestedPage - 1) * perPage; anime.length < perPage;) {
            const limit = Math.min(20, perPage - anime.length);
            const result = await page('anime', {
                ...parameters,
                include: withRelations
                    ? 'mappings,genres,mediaRelationships.destination'
                    : 'mappings,genres',
                'page[limit]': String(limit),
                'page[offset]': String(offset),
            });
            anime.push(...result.data);
            offset += limit;
            hasNextPage = Boolean(result.links?.next);
            if (!hasNextPage || !result.data.length) break;
        }
        if (withRelations) await completeRelations(anime);
        const media = anime.flatMap((entry) => {
            const value = normalize(entry, resources);
            return value && (!safe || !value.isAdult) ? [value] : [];
        });
        const counts = new Map<number, number>();
        for (const entry of media) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
        return {
            media: media.filter((entry) => counts.get(entry.id) === 1),
            pageInfo: { hasNextPage },
        };
    }
    if (operation === 'HomeAnime') {
        const seasonParameters = new Map([
            ['filter[status]', 'current,upcoming'],
            ['filter[subtype]', (input.discoveryFormats ?? ['TV', 'ONA']).join(',')],
            ['filter[userCount]', `${input.minimumPopularity ?? 0}...`],
            ['sort', '-userCount'],
        ]);
        if (input.season) seasonParameters.set('filter[season]', input.season.toLowerCase());
        if (input.seasonYear) seasonParameters.set('filter[seasonYear]', String(input.seasonYear));
        return {
            season: await catalog(Object.fromEntries(seasonParameters), 1, 30, true, false),
            popular: await catalog(
                { 'filter[subtype]': 'TV', sort: '-userCount' },
                1,
                50,
                true,
                true
            ),
        };
    }
    const parameters: Record<string, string> = {};
    if (input.search) parameters['filter[text]'] = input.search;
    if (input.minimumPopularity != null)
        parameters['filter[userCount]'] = `${input.minimumPopularity}...`;
    if (input.genre) parameters['filter[genres]'] = input.genre;
    if (input.season) parameters['filter[season]'] = input.season.toLowerCase();
    if (input.seasonYear) parameters['filter[seasonYear]'] = String(input.seasonYear);
    if (input.format || input.discoveryFormats)
        parameters['filter[subtype]'] = (
            input.format ? [input.format] : (input.discoveryFormats ?? [])
        )
            .map((format) =>
                format === 'MOVIE'
                    ? 'movie'
                    : format === 'SPECIAL'
                      ? 'special'
                      : format === 'MUSIC'
                        ? 'music'
                        : format
            )
            .join(',');
    if (input.status) {
        const status = new Map([
            ['FINISHED', 'finished'],
            ['RELEASING', 'current'],
            ['NOT_YET_RELEASED', 'upcoming,tba,unreleased'],
        ]).get(input.status);
        if (!status) throw new Error(`Kitsu cannot filter status ${input.status}`);
        parameters['filter[status]'] = status;
    }
    if (input.sort?.length) {
        const sort = new Map([
            ['POPULARITY_DESC', '-userCount'],
            ['POPULARITY', 'userCount'],
            ['SCORE_DESC', '-averageRating'],
            ['SCORE', 'averageRating'],
        ]).get(input.sort[0]!);
        if (!sort) throw new Error('Kitsu cannot reproduce the requested sort');
        parameters.sort = sort;
    }
    return {
        Page: await catalog(
            parameters,
            input.page,
            input.perPage,
            input.isAdult === false,
            operation === 'SearchAnimePage'
        ),
    };
}
