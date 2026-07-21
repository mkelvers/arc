const source =
    'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const destination = new URL(
    '../src/lib/server/anime/tmdb/mappings.json',
    import.meta.url,
);

interface Dataset {
    $meta: {
        generated_on: string;
        schema_version: string;
    };
    [source: string]: Record<string, unknown> | Dataset['$meta'];
}

const response = await fetch(source);

if (!response.ok) {
    throw new Error(`Could not download AniBridge mappings: ${response.status}`);
}

const dataset = (await response.json()) as Dataset;

if (!dataset.$meta.schema_version.startsWith('3.')) {
    throw new Error(
        `Unsupported AniBridge schema ${dataset.$meta.schema_version}`,
    );
}

const parent = new Map<string, string>();

function root(value: string): string {
    const current = parent.get(value);

    if (!current) {
        parent.set(value, value);
        return value;
    }

    if (current === value) return value;

    const result = root(current);
    parent.set(value, result);
    return result;
}

function union(left: string, right: string) {
    const leftRoot = root(left);
    const rightRoot = root(right);

    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
}

for (const [sourceDescriptor, targets] of Object.entries(dataset)) {
    if (sourceDescriptor === '$meta') continue;

    for (const targetDescriptor of Object.keys(targets)) {
        union(sourceDescriptor, targetDescriptor);
    }
}

const components = new Map<string, string[]>();

for (const descriptor of parent.keys()) {
    const component = root(descriptor);
    components.set(component, [
        ...(components.get(component) ?? []),
        descriptor,
    ]);
}

const mappings: Record<
    string,
    { id: number; mediaType: 'movie' | 'tv' }
> = {};

for (const descriptors of components.values()) {
    const anilistIds = descriptors
        .filter((descriptor) => descriptor.startsWith('anilist:'))
        .map((descriptor) => descriptor.split(':')[1]);
    const targets = [
        ...new Map(
            descriptors.flatMap((descriptor) => {
                const [provider, rawId] = descriptor.split(':');
                const id = Number(rawId);

                if (!Number.isInteger(id)) return [];
                if (provider === 'tmdb_movie') {
                    return [[`movie:${id}`, { id, mediaType: 'movie' as const }]];
                }
                if (provider === 'tmdb_show') {
                    return [[`tv:${id}`, { id, mediaType: 'tv' as const }]];
                }

                return [];
            }),
        ).values(),
    ];

    if (targets.length !== 1) continue;

    for (const anilistId of anilistIds) {
        if (anilistId) mappings[anilistId] = targets[0];
    }
}

const sentinels = {
    '1': { id: 30991, mediaType: 'tv' },
    '16498': { id: 1429, mediaType: 'tv' },
    '21519': { id: 372058, mediaType: 'movie' },
} as const;

if (Object.keys(mappings).length < 5_000) {
    throw new Error('AniBridge mapping coverage unexpectedly dropped');
}

for (const [anilistId, expected] of Object.entries(sentinels)) {
    const actual = mappings[anilistId];

    if (
        actual?.id !== expected.id ||
        actual.mediaType !== expected.mediaType
    ) {
        throw new Error(`AniBridge sentinel ${anilistId} changed unexpectedly`);
    }
}

const output = {
    $meta: {
        schemaVersion: dataset.$meta.schema_version,
        generatedAt: dataset.$meta.generated_on,
        source,
    },
    mappings: Object.fromEntries(
        Object.entries(mappings).sort(
            ([left], [right]) => Number(left) - Number(right),
        ),
    ),
};

await Bun.write(destination, `${JSON.stringify(output)}\n`);

console.log(
    `Wrote ${Object.keys(mappings).length} AniList to TMDB mappings from schema ${dataset.$meta.schema_version}`,
);
