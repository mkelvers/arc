# Frontend responsiveness audit

Date: 2026-07-03

## Scope and method

Reviewed every user-facing page type in the authenticated product: login, home, browse, search, simulcast, top picks, watchlist, anime details, reviews, and playback. Measurements were taken in the in-app browser at a 1280x720 desktop viewport against an isolated copy of the local database. Timings include browser navigation and rendering; external-provider variability means they are directional rather than production percentiles.

## Result

The frontend architecture is generally healthy. It does not need an SPA rewrite. Home, search, watchlist, and anime details already use the right techniques: progressive fragments, optimistic mutations, request cancellation, client caching, lazy images, and background progress saves.

Playback is the clear abandonment risk. The first tested episode exposed the page shell after 0.58s but remained on a spinner until it became playable at 9.75s. Manual episode switching also performs a full page navigation and took 2.59s before the next episode was playable.

## Steps and health

| Step | Surface | Observed readiness | Health |
|---:|---|---:|---|
| 1 | Login | 55ms page; 114ms sign-in navigation | Healthy |
| 2 | Home | 531ms until catalog cards replaced skeletons | Healthy |
| 3 | Browse | 980ms for 24 cards | Good |
| 4 | Browse filtering | 621ms including a 350ms debounce | Healthy |
| 5 | Search | 48ms shell; 282ms results including a 240ms debounce | Healthy |
| 6 | Simulcast | 1.38s | Acceptable, cacheable |
| 7 | Top picks | 44ms cached page; first computation ran about 10s in the background | Mixed: fast response, misleading empty state |
| 8 | Watchlist | 158ms; mutations are optimistic | Healthy |
| 9 | Anime details | 296ms useful hero; 538ms warm deferred completion | Healthy progressive loading |
| 10 | Reviews | 1.20s; 234KB initial HTML | Needs payload reduction |
| 11 | Watch episode 1 | 575ms shell; 9.75s playable | Poor |
| 12 | Manual switch to episode 2 | 910ms shell; 2.59s playable | Needs asynchronous transition |

## What is already good

- Home sections load independently behind skeletons, so one provider call does not block the shell.
- Search debounces, aborts stale requests, caches recent responses, and returns results quickly.
- Watchlist icons and labels update optimistically before persistence completes.
- Recommendation computation is already off the request path.
- Anime details defer characters, statistics, release information, watch order, and recommendations.
- Playback progress is debounced and uses `sendBeacon` on unload.
- Episode titles are enriched asynchronously after the player shell renders.

## Findings and recommendations

### P0: reduce time to playable and remove full-page episode switches

The initial player bundle is 1.16MB and is served without gzip or Brotli. A diagnostic minified build was 556KB raw and 175KB gzipped. Minify production bundles and enable text compression first.

Manual episode links currently perform a normal page navigation, even though the autoplay path already fetches `/api/watch/episode/:anime/:episode`, swaps the video source, updates state, and pushes history without reloading. Extract that transition into a shared function and intercept manual episode, Previous, and Next clicks. Keep normal navigation as the error fallback.

Add a short-lived, bounded cache plus singleflight for resolved `(anime, episode, mode)` stream sources and rewritten manifests. Prefetch the next episode when playback becomes stable, near the episode end, or on episode-link hover. The current fire-and-forget stream warm-up races the browser and does not give the proxy a reusable cached response.

After three seconds, replace the anonymous spinner with phase text such as “Finding a source” or “Loading video,” plus Retry. Announce it through a live status region.

### P1: fix static delivery

Versioned asset URLs are already generated, but static responses have no `Cache-Control` and no content compression. The browser revalidated `app.js`, HTMX, CSS, and the player bundle on full navigations. Serve versioned assets with `Cache-Control: public, max-age=31536000, immutable`, and gzip/Brotli text responses.

Resize the 1100x849, 392KB navigation logo for its roughly 40px display slot. The 512px favicon is also 113KB. Responsive, optimized PNG/WebP variants would reduce first-load transfer substantially.

### P1: represent recommendation work honestly

The recommendation cache correctly computes in the background, but a cold cache returns the same empty state used for “not enough watchlist data.” After adding an anime, the page said to add anime even while a roughly 10-second computation was active.

Return distinct `empty`, `refreshing`, and `ready` states. Preserve stale recommendations while refreshing. On the first build, show a preparing state and use a small HTMX poll rather than requiring a manual reload. Start the refresh immediately after a watchlist mutation instead of waiting for the next recommendations request.

### P2: remove duplicated or serial provider work

- The Simulcast request checks the next season and then fetches the selected season serially. Cache latest-season discovery and seasonal results for 15-60 minutes with stale-while-refresh.
- Cold anime details triggered duplicate canonical-episode refreshes from release-info and audio-availability fragments. Add singleflight keyed by anime ID around the episode refresh.
- `BuildWatchData` performs stream resolution, progress loading, season loading, and segment loading serially. Run independent local/cache lookups concurrently after anime and canonical episodes are known.
- Watchlist updates fetch full Jikan anime data before checking whether the anime row already exists. Check the local row first so status changes remain DB-only. Keep the optimistic client behavior.

### P2: shrink Reviews

The initial reviews response was 234KB of HTML and rendered full review bodies. Compressing HTML will help immediately. Then limit the initial rendered reviews or show a server-truncated preview with explicit expansion, loading more on demand.

## Accessibility risks

- The long player spinner is visual-only and gives assistive technology no progress or failure state.
- Several player controls appeared without accessible names in the browser accessibility tree.
- Skeleton regions do not expose a consistent loading announcement.

Keyboard behavior, focus restoration after HTMX swaps, screen-reader output, zoom, and mobile reflow require separate hands-on checks; screenshots alone cannot establish compliance.

## Suggested implementation order

1. Minify bundles; add compression and immutable caching; optimize logo/favicon.
2. Reuse the existing asynchronous episode transition for all manual episode controls.
3. Cache/singleflight stream resolution and manifests; prefetch the next episode.
4. Add recommendation `refreshing` state and automatic refresh.
5. Cache Simulcast discovery, deduplicate detail episode refreshes, and trim Reviews.

## Screenshots

- `01-home.png` through `14-login.png` in this folder document the tested states.
- `12-watch.png` captures the blocking playback spinner.
- `13-watch-playable.png` captures the same page after metadata became available.

## Detailed fix plans

Implementation-ready plans for every recommendation are indexed in [`fixes/README.md`](fixes/README.md).
