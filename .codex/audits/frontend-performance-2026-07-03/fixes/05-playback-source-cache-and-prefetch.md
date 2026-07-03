# Fix 05: cache and prefetch playback sources

Priority: P0  
Risk: High  
Primary benefit: Time from watch-page shell to playable media

## Issue

The first audited episode showed the player shell after 0.58s but did not expose playable metadata until 9.75s. A later episode was faster, which strongly suggests cold provider/CDN work is a major component.

`BuildWatchData` resolves a provider source for every watch request. It then starts `warmStreamURL` in a goroutine, but that warm-up races the browser and closes the upstream response without creating a reusable application cache. Manual and autoplay episode transitions can therefore repeat source resolution and manifest work.

## Goals

- Avoid resolving the same `(anime, episode, mode)` source repeatedly.
- Collapse concurrent identical resolutions into one provider call.
- Prepare the likely next episode without blocking current playback.
- Cache only metadata/manifests at first, not large video bodies.
- Generate fresh proxy tokens when serving cached source metadata.
- Respect provider expiry and avoid serving stale signed URLs indefinitely.

## Non-goals

- Do not build a general video CDN.
- Do not cache complete episodes in memory or SQLite.
- Do not expose upstream URLs or referers to the browser.
- Do not make playback depend exclusively on prefetched data.

## Cache the raw provider result, not proxy tokens

The cache value should contain the provider result before `buildModeSource` signs it:

- Upstream stream URL.
- Referer.
- Source type.
- Subtitle upstream URLs and labels.
- Resolution timestamp.
- Optional provider-declared expiry if one can be derived safely.

On every response, create fresh proxy tokens from the cached raw value. Caching signed proxy tokens would couple cache lifetime to the in-process token store and make expiry harder to reason about.

## Suggested cache shape

Key:

```text
anime_id | episode | normalized_mode
```

Value:

```text
provider result | resolved_at | fresh_until | stale_until
```

Initial policy:

- Fresh TTL: 5 minutes.
- Stale-on-provider-error window: an additional 10 minutes for completed anime.
- Maximum entries: 512.
- LRU or approximate oldest-entry eviction.
- No negative caching initially; later add a short 15-30 second negative TTL if repeated misses are observed.

Provider URLs may expire sooner than expected. Make TTL configurable and log refresh failures. Never infer a multi-hour TTL unless the provider contract supports it.

## Singleflight

Wrap provider resolution with a request-collapsing mechanism keyed by the same cache key:

1. Check fresh cache.
2. If missing/stale, join an existing in-flight resolution or become its owner.
3. Resolve through the provider once.
4. Store the raw provider result.
5. Return a cloned value to callers.

Use a context policy deliberately. If the owning browser request is cancelled, all joined requests should not necessarily fail. A short service-owned timeout may be more appropriate, but it must still stop promptly during application shutdown.

## Client-side episode payload prefetch

After the current episode reaches playable metadata:

1. Identify the next valid episode.
2. If `navigator.connection.saveData` is not enabled, fetch its minimal `/api/watch/episode/...` payload at low priority.
3. Store the parsed payload in a bounded in-memory map in the player.
4. When the user transitions, consume the prefetched payload if its mode and episode match.
5. Fall back to a normal fetch when absent or expired.

Also prefetch on pointer hover/focus of a specific episode link after a short delay. Cancel hover prefetch when the target changes.

Do not prefetch several episodes. One likely next episode plus one explicitly hovered episode is enough.

## Manifest caching

For HLS sources, cache the raw upstream playlist before rewriting it. Rewrite proxy URLs and issue tokens per response.

Suggested initial policy:

- Completed/VOD media playlist: 30-60 seconds.
- Airing/live playlist: either no cache or a very short 2-5 second TTL.
- Maximum body: retain the existing bounded playlist read limit.
- Key includes upstream URL and referer identity.
- Never cache media segment bodies in the first version.

This cache belongs near `HandleProxyStream`, not inside the browser. It should preserve upstream status and relevant content headers while removing stale `Content-Length` after rewriting.

## Connection warm-up

Keep Go HTTP transports long-lived so DNS, TCP, and TLS connections are reused. If `warmStreamURL` remains, make it purposeful:

- For a playlist, read the bounded manifest and populate the manifest cache.
- For direct media, avoid an unbounded GET. If a provider supports ranges, a small range probe may validate availability, but only after measuring that it improves time to metadata.

Do not download bytes merely to create the appearance of optimization.

## Failure behavior

- Fresh cache hit: serve immediately.
- Stale cache plus successful refresh: replace and serve new value.
- Stale cache plus provider failure: optionally serve stale for completed media and record the event.
- No cache plus failure: return the existing error path.
- Media error after cached source: force one source refresh that bypasses cache, then fail normally.

## Security

- Never log raw upstream URLs, referers, subtitle URLs, or proxy tokens.
- Keep cached provider metadata process-local unless encryption and retention are designed explicitly.
- Preserve `proxytarget.Validate` before signing or proxying every cached URL.
- Bound memory and reject unexpectedly large manifests.

## Affected files

- `internal/playback/service.go`
- `internal/playback/watch_data.go`
- `internal/playback/handler/proxy_stream.go`
- `internal/playback/handler/hls_playlist.go`
- New bounded cache implementation under `internal/playback/`
- `static/player/episodes/nav.ts`
- `static/player/main.ts`
- Playback and proxy tests

## Tests

- Repeated source lookup hits the provider once within TTL.
- Concurrent identical lookups hit the provider once.
- Different episode/mode keys do not collide.
- Expired entries refresh.
- Forced refresh bypasses cache after media error.
- Fresh proxy tokens are generated from cached raw data.
- Raw HLS playlist is cached; rewritten tokenized output is not shared incorrectly.
- Cache enforces item and body-size limits.
- Prefetched episode payload is used once and cannot overwrite a newer transition.
- Save-Data disables automatic prefetch.

## Observability

Add counters/histograms for:

- Source cache hit, miss, stale-hit, eviction.
- Singleflight owner versus joined requests.
- Provider source-resolution duration.
- Manifest cache hit/miss and upstream duration.
- Prefetch started, used, expired, cancelled, failed.
- Time from player initialization to metadata and first frame.

## Rollout

1. Add measurements without behavior changes.
2. Add source-result cache and singleflight.
3. Add next-episode payload prefetch.
4. Add manifest cache only after source-cache results are understood.
5. Tune TTLs from observed provider expiry and error data.

## Acceptance criteria

- Repeated identical source requests do not call the provider within the fresh TTL.
- Concurrent identical source requests collapse into one provider call.
- Warm episode transition reaches playable metadata under 1.5 seconds at p75.
- Cold start shows a meaningful loading state and trends below 4 seconds at p75.
- No upstream URL/token appears in logs or rendered HTML beyond existing opaque proxy tokens.
- Memory remains bounded under sustained browsing.

