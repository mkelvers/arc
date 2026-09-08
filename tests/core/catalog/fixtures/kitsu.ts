// Small JSON:API fixtures following live Kitsu mappings and anime responses, 2026-09-08.
export function kitsuFixture(kitsuId = '49235', anilistId = 182205, malId = 59970) {
    const mapping = {
        id: String(anilistId),
        type: 'mappings',
        attributes: { externalSite: 'anilist/anime', externalId: String(anilistId) },
        relationships: { item: { data: { type: 'anime', id: kitsuId } } },
    };
    const malMapping = {
        ...mapping,
        id: String(malId),
        attributes: { externalSite: 'myanimelist/anime', externalId: String(malId) },
    };
    return {
        mappings: { data: [mapping, malMapping] },
        anime: {
            data: [
                {
                    id: kitsuId,
                    type: 'anime',
                    attributes: {
                        canonicalTitle: 'Tensei Shitara Slime Datta Ken 4th Season',
                        titles: {
                            en: 'That Time I Got Reincarnated as a Slime Season 4',
                            en_jp: 'Tensei Shitara Slime Datta Ken 4th Season',
                            ja_jp: '転生したらスライムだった件 第4期',
                        },
                        description: 'The fourth season.',
                        subtype: 'TV',
                        status: 'current',
                        episodeCount: 24,
                        episodeLength: 24,
                        startDate: '2026-04-03',
                        endDate: null,
                        averageRating: '82.44',
                        userCount: 3036,
                        favoritesCount: 18,
                        posterImage: {
                            original: 'https://media.kitsu.app/poster.jpg',
                            large: 'https://media.kitsu.app/large.jpg',
                        },
                        coverImage: null,
                        nsfw: false,
                    },
                    relationships: {
                        mappings: {
                            data: [mapping, malMapping].map(({ type, id }) => ({ type, id })),
                        },
                        genres: { data: [] },
                        mediaRelationships: { data: [] },
                        staff: { data: [] },
                        productions: { data: [] },
                    },
                },
            ],
            included: [mapping, malMapping],
        },
    };
}
