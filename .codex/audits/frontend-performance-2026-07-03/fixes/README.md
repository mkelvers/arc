# Frontend performance fix pack

This folder turns the findings in [`../audit.md`](../audit.md) into implementation-ready plans. Each plan explains the problem, the proposed design, affected code, edge cases, tests, rollout strategy, observability, and acceptance criteria.

These are planning documents only. No application source has been changed.

## Recommended order

| Order | Priority | Fix | Expected outcome | Depends on |
|---:|---|---|---|---|
| 1 | P0 | [Minify frontend bundles](01-minify-frontend-bundles.md) | Smaller JavaScript, especially on the watch page | None |
| 2 | P0 | [Compress and cache static responses](02-static-compression-and-caching.md) | Avoid transferring 1.16MB of raw player JavaScript and repeated revalidation | Fix 1 recommended |
| 3 | P1 | [Optimize logo and icon assets](03-image-asset-optimization.md) | Remove roughly 500KB of oversized first-load images | None |
| 4 | P0 | [Make manual episode changes asynchronous](04-async-episode-navigation.md) | Remove full-page reloads between episodes | None |
| 5 | P0 | [Cache and prefetch playback sources](05-playback-source-cache-and-prefetch.md) | Reduce time from player shell to playable video | Fix 4 recommended |
| 6 | P1 | [Improve player loading and recovery states](06-player-loading-and-recovery.md) | Make unavoidable waits understandable and accessible | Can ship independently |
| 7 | P1 | [Represent recommendation refresh state](07-recommendation-refresh-state.md) | Stop showing a false empty state during background work | None |
| 8 | P2 | [Cache Simulcast discovery](08-simulcast-cache.md) | Remove repeated serial provider requests | None |
| 9 | P2 | [Deduplicate canonical episode refreshes](09-canonical-episode-singleflight.md) | Prevent duplicate provider work on anime details | None |
| 10 | P2 | [Parallelize watch-data assembly](10-parallel-watch-data-assembly.md) | Reduce watch-page server time without changing behavior | Fix 9 recommended |
| 11 | P2 | [Make watchlist updates local-first](11-watchlist-local-first-update.md) | Keep existing-anime status changes DB-only | None |
| 12 | P2 | [Reduce Reviews payload](12-reviews-payload-reduction.md) | Lower initial HTML size and rendering cost | Fix 2 recommended |

## Delivery slices

### Slice A: low-risk transfer wins

Ship fixes 1-3 together. They do not change product behavior and should be the safest first release. Capture bundle sizes and response headers before and after deployment.

### Slice B: playback responsiveness

Ship fix 4 first, then fix 5. Fix 6 can ship with either. Keep ordinary page navigation as a fallback until asynchronous transitions have proven reliable.

### Slice C: honest background work

Ship fix 7. It changes recommendation-state semantics, the handler contract, and the rendered UI together.

### Slice D: provider and payload cleanup

Ship fixes 8-12 independently. They are smaller optimizations and should not block the P0 work.

## Shared performance gates

- Do not replace the current server-rendered architecture with a client-side router.
- Keep every asynchronous action recoverable through an ordinary URL or retry action.
- Bound all caches by item count and TTL.
- Never cache user-specific HTML in shared static caches.
- Preserve request cancellation through `context.Context` and `AbortController`.
- Add measurements before optimizing so regressions are visible.
- Validate on a throttled connection as well as localhost; localhost hides transfer and network latency.

## Suggested release targets

These targets are directional and should be confirmed under representative production conditions:

- Home catalog ready: under 1 second at p75.
- Search results after debounce: under 500ms at p75.
- Watch page shell: under 800ms at p75.
- Warm episode change: under 1.5 seconds to playable at p75.
- Cold episode start: under 4 seconds to playable at p75, with a useful status shown after 3 seconds.
- Versioned static assets: no revalidation during their one-year cache lifetime.
- Reviews initial HTML: under 100KB uncompressed.

