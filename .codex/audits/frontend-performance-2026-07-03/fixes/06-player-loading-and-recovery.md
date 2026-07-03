# Fix 06: improve player loading and recovery states

Priority: P1  
Risk: Low to medium  
Primary benefit: Perceived performance, accessibility, and error recovery

## Issue

The player displays an animated spinner over a black frame while loading. During the audited cold start, this state lasted almost ten seconds. The spinner does not explain whether the application is finding a source, loading metadata, buffering media, retrying, or stuck. It also lacks a useful live status for assistive technology.

Several player buttons also appeared without accessible names in the browser accessibility tree.

## Goal

Make waits understandable without adding noisy progress theater. The loading UI should expose a small state machine, announce meaningful changes, and always provide a recovery path.

## Proposed state model

```text
idle
resolving_source
loading_media
buffering
retrying
ready
unavailable
```

State meanings:

- `resolving_source`: waiting for the episode API/provider result.
- `loading_media`: source is known; waiting for manifest/metadata.
- `buffering`: metadata exists but playback has stalled.
- `retrying`: refreshing the source after a media error.
- `unavailable`: all bounded attempts failed.
- `ready`: overlay hidden.

Do not attempt to show a fake percentage. The application does not know enough to estimate completion accurately.

## Visual behavior

- Show the spinner immediately to acknowledge the action.
- Keep text visually quiet for short waits.
- After roughly 3 seconds, show a short status such as “Loading video…” or “Finding a source…”.
- After roughly 8-10 seconds, show “This is taking longer than usual” and a Retry action.
- On terminal failure, show Retry and Back to details.
- Keep episode title/context visible where possible.
- Avoid replacing the whole page; recovery stays inside the player.

## Accessibility behavior

Use a stable status element inside the player:

```html
<div role="status" aria-live="polite" aria-atomic="true">
  <span data-loading-message>Loading video…</span>
</div>
```

Guidelines:

- Do not announce every buffering event; debounce announcements to avoid screen-reader noise.
- Use `aria-busy="true"` on the player container while a transition is active.
- Move focus only for terminal errors, not normal loading.
- Give play/pause, mute, fullscreen, seek, and navigation buttons stable accessible names.
- Ensure disabled controls expose native `disabled` or an equivalent semantic state.

## State ownership

Centralize overlay changes in one module/function. Currently media event handlers manipulate `loading.style.display` directly in several places. Replace scattered writes with a function such as `setPlayerLoadState(state, options)`.

That function should:

- Update `data-load-state` on the player root.
- Toggle visibility.
- Set `aria-busy`.
- Update status copy.
- Start/cancel the long-wait timer.
- Expose Retry only in retryable states.

## Retry policy

- Episode payload failure: one ordinary fallback navigation, unless already on that URL.
- Media source error: refresh the current mode source once.
- Repeated media failure: stop automatic retries and show Retry.
- User Retry: force source refresh, reset media element, and reload.
- Never create an infinite retry loop.

## Affected files

- `templates/components/video_player.gohtml`
- `static/player/main.ts`
- `static/player/source.ts`
- `static/player/video.ts`
- `static/player/state.ts`
- `static/player/controls.ts`
- Player browser-flow tests

## Tests

- Loader appears immediately on source change.
- Status text appears only after the delay.
- Ready metadata hides the loader and clears timers.
- Waiting after ready enters buffered/loading state without repeated announcements.
- One media error attempts one refresh.
- Repeated failure exposes Retry and stops looping.
- Retry performs a forced source refresh.
- Every icon-only control has an accessible name.
- `aria-busy` accurately follows transition state.

## Observability

Record client-side phase durations without sensitive URLs:

- Source resolution.
- Media metadata wait.
- Buffering count and duration.
- Retry count.
- Terminal unavailable state.

The existing HLS profiling hook can remain for HLS-specific detail; add source-independent timing for direct media too.

## Rollout

Ship the centralized state function and accessible labels first without changing retry counts. Then enable delayed copy and user Retry. This separates semantic/visual regressions from source-refresh behavior changes. Verify with direct media and HLS sources.

## Acceptance criteria

- No indefinite spinner exists without text or a recovery action.
- A useful status appears after 3 seconds.
- Retry appears after the long-wait threshold or a terminal failure.
- Player root exposes `aria-busy` during loading.
- All icon-only player controls have accessible names.
- Retry loops are bounded.
