---
finding: "Validate playback proxy targets before signing/fetching"
catalog: "Security"
impact: "A compromised provider response can cause the server-side playback proxy to fetch arbitrary HTTP(S) targets."
base_commit: "0d31d46"
---

## Effort

M - validation needs careful tests around providers, redirects, and legitimate CDN URLs.

## Risk

MED - overly strict validation can block legitimate playback hosts or subtitle CDNs.

## Confidence

HIGH - provider URLs are accepted and later fetched server-side without target validation.

## Evidence

- `integrations/playback/allanime/sources.go:115-131` accepts any direct `http://` or `https://` source URL that is not detected as an embed.
- `internal/playback/watch_data.go:181-191` signs subtitle and stream URLs returned by the provider.
- `internal/playback/handler/proxy_request.go:13-24` creates a server-side GET request to the signed target URL.
- `internal/playback/handler/proxy_stream.go:33` and `internal/playback/handler/proxy_subtitle.go:34` execute those requests.

## Resolution Approach

Introduce a proxy target validation boundary before issuing tokens and before fetching token targets. The validation should reject non-HTTP(S) schemes, empty hosts, loopback, private, link-local, and otherwise local network destinations. Because DNS and redirects can change the destination, validation should cover the final network target used by the HTTP client, not only the original string.

Keep legitimate provider/CDN behavior in mind. If a host allowlist is practical for AllAnime and known subtitle hosts, prefer it. If not, use network-range blocking with strong tests and conservative redirect handling.

Apply validation in two places: before signing tokens in playback service code, and again in the proxy handler before `Do` as defense in depth. Add tests for direct stream URLs, subtitle URLs, HLS playlist rewrites, and redirect behavior. Do not include runnable abuse payloads in tests or docs; keep cases generic and defensive.

Verify with `go test ./internal/playback/... ./integrations/playback/allanime/...` and `bun run lint:go` after the lint baseline is fixed.
