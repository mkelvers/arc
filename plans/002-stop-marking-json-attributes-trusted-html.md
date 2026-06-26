---
finding: "Stop marking JSON attributes as trusted HTML"
catalog: "Security"
impact: "Provider-controlled strings can break quoted data attributes on the watch page, creating an HTML injection risk."
base_commit: "0d31d46"
---

## Effort

S - localized template helper and tests.

## Risk

LOW - the intended behavior is still to serialize data for client-side parsing, but escaping must be handled by `html/template`.

## Confidence

HIGH - the current helper explicitly bypasses contextual escaping.

## Evidence

- `templates/funcs.go:37-42` marshals JSON and returns `template.HTMLAttr`.
- `templates/renderer.go:46-50` registers the helper as `json`.
- `templates/components/video_player.gohtml:10-12` embeds JSON inside single-quoted `data-*` attributes.
- `internal/playback/watch_data.go:181-188` copies provider subtitle labels into that serialized payload.

## Resolution Approach

Change the JSON serialization path so marshaled JSON is not marked as trusted `template.HTMLAttr`. Let `html/template` perform contextual escaping, or move larger JSON payloads into `<script type="application/json">` blocks where the template engine can safely escape script content.

The executor should preserve the client contract used by `static/player/state.ts`: the player still needs to read mode sources, available modes, and skip segments from the rendered page. If the storage location changes from `data-*` attributes to JSON script tags, update the parser in one place and add tests around that parser.

Add a template or renderer test that renders a watch-page-like payload containing apostrophes, double quotes, angle brackets, and ampersands in provider-controlled fields such as subtitle labels. The test should assert the rendered HTML does not create new attributes or tags and that the browser-side parser can recover the original data.

Verify with `go test ./templates ./internal/playback/...`, `bunx tsc -p tsconfig.json --noEmit`, and `bun test`.
