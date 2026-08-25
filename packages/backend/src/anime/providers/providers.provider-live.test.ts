import { expect, test } from 'bun:test';

if (process.env.LIVE_PROVIDER_TESTS === '1') {
    const { getAnime } = await import('../anilist/details');
    const { allanimeProvider } = await import('./allanime');
    const { aniDBAppProvider } = await import('./anidb-app');
    const { anibdProvider } = await import('./anibd');
    const { anikotoProvider } = await import('./anikoto');
    const { aninekoProvider } = await import('./anineko');
    const { animeDunyaProvider } = await import('./animedunya');
    const { animeggProvider } = await import('./animegg');
    const { animeNoSubProvider } = await import('./animenosub');
    const { animepaheProvider } = await import('./animepahe');
    const { anipubProvider } = await import('./anipub');
    const { anizoneProvider } = await import('./anizone');
    const { kickAssAnimeProvider } = await import('./kickassanime');
    const { reAnimeProvider } = await import('./reanime');
    const { senshiProvider } = await import('./senshi');
    const { twoDHiveProvider } = await import('./two-d-hive');

    const providers = [
        allanimeProvider,
        anikotoProvider,
        aninekoProvider,
        animeggProvider,
        senshiProvider,
        anipubProvider,
        animepaheProvider,
        anizoneProvider,
        reAnimeProvider,
        aniDBAppProvider,
        twoDHiveProvider,
        anibdProvider,
        animeDunyaProvider,
        animeNoSubProvider,
        kickAssAnimeProvider,
    ];

    for (const provider of providers) {
        test(`${provider.name} satisfies the live playback contract`, async () => {
            const anime = await getAnime(21);
            const episodes = await provider.getEpisodes(anime);
            expect(episodes.length).toBeGreaterThan(0);

            const episode = episodes.find(({ number }) => number === 1) ?? episodes[0];
            expect(episode.id).not.toBe('');
            expect(episode.audio.length).toBeGreaterThan(0);

            const streams = await provider.getStreams(anime, episode, episode.audio);
            expect(Object.values(streams).flat().length).toBeGreaterThan(0);
        }, 60_000);
    }
} else {
    test('live provider contract tests are opt-in', () => {
        expect(process.env.LIVE_PROVIDER_TESTS).not.toBe('1');
    });
}
