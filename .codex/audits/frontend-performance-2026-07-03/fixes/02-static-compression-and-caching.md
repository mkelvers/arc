# Fix 02: compress and cache static responses

Priority: P0  
Risk: Medium  
Primary benefit: Network transfer and repeated navigation cost

## Issue

The application uses Gin's static handlers for `/static` and `/dist` in `internal/server/server.go`. Asset URLs under `/dist` already include a version derived from modification time and size through `assetURL`, but responses have neither `Cache-Control` nor `Content-Encoding`.

Observed consequences:

- The 1.16MB player bundle was transferred uncompressed on first use.
- CSS and JavaScript were revalidated with `304 Not Modified` on full-page navigations.
- A cache-busting URL existed, but the response did not tell the browser it was safe to retain the asset immutably.

## Desired behavior

- Versioned `/dist` assets are cached for one year as immutable.
- Unversioned or user-specific responses are not given immutable caching.
- JavaScript, CSS, HTML, JSON, SVG, and text are compressed when beneficial.
- Video streams, HLS segments, range responses, and already compressed images are not buffered or recompressed.
- `Vary: Accept-Encoding` is set when content negotiation is used.

## Proposed design

Use two narrowly scoped middleware responsibilities:

1. Static cache policy middleware for `/dist` and selected fingerprinted assets.
2. Compression middleware for ordinary textual responses, explicitly excluding playback proxy routes and unsuitable content types.

The static cache middleware must run before the static handler writes headers. A simple policy is:

- `/dist/...` with a non-empty `v` query: `public, max-age=31536000, immutable`.
- `/dist/...` without `v`: `public, max-age=0, must-revalidate` during transition.
- `/static/...` icons/images: use a shorter cache until their URLs are fingerprinted; then move them to immutable URLs.
- HTML and authenticated JSON: no shared immutable caching.

Query-string versioning works in modern browsers, but content-hashed filenames are more robust with CDNs. Filename hashing can be a later improvement; it is not required to fix the present issue.

## Compression options

### Option A: middleware compression

Use a maintained Gin/Go compression middleware or a small custom wrapper. It must:

- Respect `Accept-Encoding`.
- Skip responses that already set `Content-Encoding`.
- Skip `HEAD`, `204`, `304`, and range/partial responses.
- Skip `/watch/proxy/stream` and `/watch/proxy/subtitle` unless subtitle text is handled separately and safely.
- Skip `video/*`, `audio/*`, PNG, JPEG, WebP, AVIF, ZIP, and other already compressed formats.
- Avoid compressing very small bodies where headers and CPU cost exceed savings.

### Option B: precompressed build artifacts

Generate `.gz` and `.br` variants of production JS/CSS and serve the correct file by `Accept-Encoding`. This minimizes runtime CPU and is attractive for a single-server deployment, but requires a custom static handler and correct `Vary`/content headers.

Start with middleware compression unless profiling shows runtime CPU pressure. The application is modest and prioritizes operational simplicity.

## Middleware ordering

Recommended order:

1. Request context/request ID.
2. Recovery and logging as currently required.
3. Compression decision.
4. Static cache policy.
5. Route/static handler.

Confirm that the request logger records final status and bytes correctly when the writer is wrapped.

## Security and correctness

- Do not apply public caching to authenticated HTML, public watchlist JSON with user data, or session-dependent fragments.
- Never cache signed playback proxy responses by a public key unless the token and upstream expiry model explicitly support it.
- Preserve `Content-Range`, `Accept-Ranges`, and streaming behavior for media.
- Add `Vary: Accept-Encoding` to prevent an intermediary from serving gzip bytes to a client that did not request them.

## Affected files

- `internal/server/server.go`
- New middleware file under `internal/server/`
- `templates/funcs.go` if asset versioning changes
- Middleware and response-header tests under `internal/server/`

## Tests

Add table-driven tests covering:

- Versioned JS receives immutable caching.
- Unversioned JS does not receive immutable caching.
- HTML is not publicly cached.
- Text response compresses when gzip is accepted.
- Response remains plain when compression is not accepted.
- `Vary: Accept-Encoding` is present.
- Playback proxy and range responses are not compressed or buffered.
- `304` and `HEAD` responses remain correct.

## Verification

Use header checks:

```sh
curl -sSI 'http://localhost:3000/dist/static/app.js?v=test'
curl -sSI -H 'Accept-Encoding: gzip' 'http://localhost:3000/dist/static/player/main.js?v=test'
curl -sSI -H 'Accept-Encoding: gzip' 'http://localhost:3000/watch/proxy/stream?token=invalid'
```

Then use browser developer tools to confirm that a second full navigation uses memory/disk cache and does not revalidate versioned assets.

## Observability

Track uncompressed versus compressed response bytes, selected content encoding, compression CPU time if available, static `200` versus `304` counts, and playback proxy/range errors. A successful rollout should sharply reduce transferred JS/CSS bytes and repeated `304` requests without changing media error rates.

## Rollout

Ship cache headers and compression behind separate code paths so either can be reverted independently. Watch CPU, response bytes, error rates, and playback range-request behavior after release.

## Acceptance criteria

- Versioned `/dist` assets return one-year immutable caching.
- JavaScript and CSS are compressed for supporting clients.
- Repeated full-page navigation does not revalidate unchanged versioned assets.
- Playback streaming and range requests behave exactly as before.
- No authenticated response receives public immutable caching.

## Reference

- [Gin static-file and middleware documentation](https://github.com/gin-gonic/gin/blob/master/docs/doc.md)
