---
finding: "Characterize the browser player flow"
catalog: "Tests"
impact: "Critical watch behavior can regress while parser tests and typecheck still pass."
base_commit: "0d31d46"
---

## Effort

M - add a focused DOM/browser test harness and cover the highest-risk interactions.

## Risk

LOW - tests should characterize existing behavior, not change product behavior.

## Confidence

HIGH - existing TypeScript tests cover helpers, while the player orchestration is largely untested.

## Evidence

- `static/player/main.ts:141-149` wires progress, controls, keyboard, skip, subtitles, quality, and mode behavior in one browser-only flow.
- `static/player/progress.ts:65-76` persists progress through `fetch` and updates save state.
- `static/player/episodes/complete.ts:10-28` posts completion, retries failures, and mutates UI state.
- Existing TS tests are limited to `static/player/validate.test.ts` and `static/player/subtitles/vtt.test.ts`.

## Resolution Approach

Add targeted browser-player characterization tests without recreating broad flaky E2E coverage. Prefer small DOM tests under `static/player` that construct minimal player markup, stub `fetch`, `navigator.sendBeacon`, media element properties, timers, and `window.showToast`, then exercise the exported setup or lower-level modules.

Start with the highest-risk flows: initial source URL construction from mode token and quality preference, progress save on pause/scrub, completion retry behavior, and graceful handling when no playable source exists. If current modules are hard to test, introduce minimal testability seams while preserving runtime behavior.

Avoid reintroducing full Playwright infrastructure unless a lightweight DOM approach is insufficient. Keep fixtures short and readable so failures explain a specific player behavior.

Verify with `bun test`, `bunx tsc -p tsconfig.json --noEmit`, and `bun run lint:ts`.
