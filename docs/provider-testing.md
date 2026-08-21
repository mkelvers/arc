# Testing external providers

This document defines how Arc should test playback providers when provider tests return.

The rule is simple. A provider test either checks pure Arc logic without HTML or makes a real request through the production provider. It must not build a fake website inside the test.

## What a live provider test proves

A live provider contract test answers this question:

> Does the production provider still satisfy Arc's playback contract against the provider as it exists now?

The request path must remain intact:

```text
live contract test
    -> production PlaybackProvider
    -> production headers, cookies, timeouts, and request policy
    -> native fetch
    -> real external provider
    -> live HTML or JSON
    -> production parser and validation
    -> ProviderEpisode or ProviderStreams
    -> semantic assertions
```

The test should call `PlaybackProvider.getEpisodes` and `PlaybackProvider.getStreams`. It should not import a private scraping function merely because that function is easier to test.

## The two allowed kinds of provider test

### Pure unit tests

Keep ordinary unit tests for deterministic provider rules that do not consume HTML or contact a provider. Examples include episode matching, title normalization, URL validation, caption selection, and fallback ordering.

These tests belong in the normal `bun test` suite. Their inputs should be small domain values such as `ProviderEpisode[]`, URLs, titles, and audio modes.

### Live provider contract tests

Use live contract tests for scraping and external protocol behavior. These tests use the real network and the production provider implementation.

They must be opt-in. A normal `bun test` run must not send requests to third-party anime sites. Use a clear environment gate such as `LIVE_PROVIDER_TESTS=1`, and give live files an unmistakable name such as `animegg.provider-live.test.ts`.

When the suite is added, expose a dedicated command such as `bun run test:providers`. That command should mean, without qualifications, "contact the real providers now."

## Never fake provider HTML

### Bad: replace global fetch

```ts
const nativeFetch = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = mockFetch;
});

afterEach(() => {
    globalThis.fetch = nativeFetch;
});
```

This mutates process-wide state. It can leak across tests, depends on execution order, and hides whether the real provider still works.

### Good: leave fetch alone

```ts
import { expect, test } from 'bun:test';

import { getAnime } from '../anilist/details';
import { animeggProvider } from './animegg';

test('AnimeGG satisfies the playback contract for a known release', async () => {
    const anime = await getAnime(21);
    const episodes = await animeggProvider.getEpisodes(anime);

    expect(episodes.length).toBeGreaterThan(0);

    const episode = episodes.find(({ number }) => number === 1);
    if (!episode) {
        throw new Error('AnimeGG returned no episode 1 for AniList 21');
    }

    const streams = await animeggProvider.getStreams(anime, episode, episode.audio);
    expect(Object.values(streams).flat().length).toBeGreaterThan(0);
}, 60_000);
```

This is an example of the intended shape, not a test that must be copied verbatim. The final test must select a release and episode that match the provider's real contract.

### Bad: import an HTML fixture

```ts
import searchPage from './fixtures/animegg/search.html' with { type: 'text' };
import seriesPage from './fixtures/animegg/series.html' with { type: 'text' };
```

The fixture is a frozen copy of yesterday's provider. It cannot tell us whether today's provider changed, blocked Arc, or stopped returning the data Arc needs.

### Bad: write a fake page in TypeScript

```ts
const seriesPage = `
    <a class="anm_det_pop" href="/anime/example/1">
        <strong>Episode 1</strong>
    </a>
`;

const response = new Response(seriesPage, { status: 200 });
```

This tests HTML invented by Arc's test author. It often mirrors the parser so closely that both are wrong in the same way.

### Good: let the provider obtain its own response

```ts
const episodes = await animeggProvider.getEpisodes(anime);
```

Do not fetch a page in the test and then hand it to a private parser. Calling the provider through its public interface also exercises URL construction, headers, status handling, validation, mapping, and parsing.

### Bad: delay an import to support a patched global

```ts
globalThis.fetch = mockFetch;
const { animeggProvider } = await import('./animegg');
```

The import order is now part of the fake environment. Static imports should work because the test does not patch globals.

### Good: use normal imports

```ts
import { animeggProvider } from './animegg';
```

## Assert Arc's contract, not the provider's markup

### Bad: assert implementation details from HTML

```ts
expect(html).toContain('class="episode-list"');
expect(html).toContain('x-data=');
```

Arc does not promise either string to its callers. The provider can redesign its page while Arc continues to work.

### Bad: freeze volatile catalog facts

```ts
expect(episodes).toHaveLength(220);
expect(streams[0].url).toBe('https://cdn.example/exact-path/master.m3u8');
```

Counts, CDN hosts, tokens, and stream paths can change without breaking the contract.

### Good: assert normalized results

```ts
expect(episodes.length).toBeGreaterThan(0);

for (const episode of episodes.slice(0, 3)) {
    expect(episode.id).not.toBe('');
    expect(Number.isSafeInteger(episode.number)).toBe(true);
    expect(episode.number).toBeGreaterThan(0);
    expect(episode.audio.length).toBeGreaterThan(0);
}
```

For streams, assert the actual promise being tested. URL syntax only proves that Arc returned a URL. If the test claims a stream is reachable, make a bounded request using the same referer and headers that playback uses, then validate the response type or manifest structure.

## Test one playback journey per provider

A provider's main live test should exercise one coherent journey:

```text
obtain current AniList data for a stable release
    -> resolve the provider's episode inventory
    -> choose a representative episode from that inventory
    -> resolve the requested audio mode
    -> validate the returned stream contract
```

Do not repeat the full journey in several tests unless each run covers different provider behavior. One journey uses fewer requests and produces a clearer failure.

Add another live case only for a real difference such as pagination, separate dub inventory, subtitles, or a distinct stream protocol.

## Use real AniList data

Do not maintain a hand-written `animeTestData` object for a live provider test. Obtain the current `AniListAnime` through Arc's production AniList operation using a stable AniList ID.

### Bad

```ts
const anime = {
    id: 21,
    title: { english: 'One Piece' },
    episodes: 1_200,
    // Dozens of fields copied until the type checker stops complaining.
};
```

### Good

```ts
const anime = await getAnime(21);
const episodes = await provider.getEpisodes(anime);
```

This deliberately includes AniList in the live journey because provider matching depends on current AniList identity and release metadata.

## Database and environment rules

Provider mapping is durable production behavior. A live test that exercises mapping may require `DATABASE_URL` and may write provider mappings.

- Run live tests against an isolated test or development database. Never point them at production.
- Load the environment before importing server modules that require it.
- Do not weaken `packages/db/src/index.ts` so tests can import database code without `DATABASE_URL`.
- Do not hide a missing database configuration with a mock, delayed import, or fallback database.
- Clean up only data owned by the live test. Do not wipe shared tables.

If a test fails during module loading with `DATABASE_URL is not configured`, the live test command or environment is incomplete. The database module is correctly rejecting an invalid server configuration.

## Network rules

Third-party sites do not belong to Arc, so live tests must behave responsibly.

- Run provider journeys sequentially. Do not use concurrent tests.
- Set a timeout on each production request and a larger timeout on the whole test.
- Make the fewest requests needed to prove the contract.
- Never loop over a large catalog.
- Do not retry parser failures or empty results.
- At most, retry one clearly transient network failure if the provider's production policy already permits it.
- Report the provider name, operation, status code, and safe URL path in errors. Do not print cookies, tokens, full signed URLs, or response bodies.

A provider changing its HTML is a real failure. A timeout, rate limit, regional block, or provider outage is also real, but the failure report must distinguish those cases.

## When Playwright belongs here

Use native `fetch` when the initial HTML or JSON response contains the data the production parser needs. Cheerio parses HTML but does not run page JavaScript.

Use Playwright only if production provider behavior requires a browser. Valid reasons include JavaScript-generated content, a browser-created cookie, or browser-local state that cannot be replaced by a direct documented request.

Do not add Playwright because a provider has a website. If the useful data comes from a JSON endpoint, call that endpoint through the production provider.

Most importantly, the test and production code must use the same transport. A Playwright test does not validate a production adapter that uses native `fetch`. If Playwright becomes necessary, browser-backed behavior must belong to the production provider boundary first.

## What runs in the normal suite

The normal suite should contain:

- pure provider matching and policy tests;
- tests for Arc-owned validation and transformations;
- no real third-party requests;
- no provider HTML, whether inline or imported;
- no mutation of `globalThis.fetch`.

The opt-in live suite should contain:

- real requests through production provider interfaces;
- a small number of stable playback journeys;
- semantic assertions on normalized Arc results;
- explicit environment, timeout, database, and rate-limit handling.

Do not introduce MSW, Nock, Mockttp, fetch-mock, or another interception library for live provider tests. Interception removes the external system that these tests exist to verify.

## Review checklist

Before accepting a provider test, answer all of these with yes:

- Does it test an Arc-owned pure rule or contact the real provider?
- Does a live test call the production provider's public interface?
- Does the test leave `globalThis` untouched?
- Does it avoid inline and imported HTML?
- Does it avoid test-only dynamic imports?
- Does it assert `ProviderEpisode` or `ProviderStreams` behavior rather than HTML text?
- Is live network access opt-in?
- Are request and test timeouts bounded?
- Will the test avoid production data and secrets?
- Does it send only a small, sequential set of requests?
- Would a meaningful provider breakage make the test fail for a clear reason?

If any answer is no, fix the test design before adding the test.

## References

- [Bun test runner](https://bun.sh/docs/test)
- [Bun fetch](https://bun.sh/docs/runtime/networking/fetch)
- [Cheerio](https://cheerio.js.org/docs/intro/)
- [Playwright](https://playwright.dev/docs/intro)
