# Routes

Routes own HTTP semantics, page composition, route-specific interaction, and user-facing failure wording. Put one-route mechanics beside the route instead of creating a shared helper merely to shorten a page.

Every server-loaded page sets the unprefixed `pageTitle` it owns. The root layout is the only place that formats the document title as `Arc — ${pageTitle}`, falling back to `Arc`. Do not add a `title.ts`, `documentTitle`, or per-page prefix/suffix helper. A page with no server load may set the complete title directly only when the root contract cannot supply it.

Keep API and page route validation consistent through a genuinely shared boundary parser when they accept the same input. Keep their response shape, status codes, logs, and user-facing errors local when those semantics differ. Do not consolidate two routes merely because three lines look alike.

Use server loads and actions for server-owned work. In Svelte pages, derive view values and use explicit event/navigation handlers. Effects are reserved for real browser synchronization such as debouncing URL state, aborting requests, observers, or external storage.

An API route that delegates to one deep server operation can be deliberately short; the route still owns method, authentication, validation, and response mapping. Do not inline security-sensitive server protocols into route files to avoid a small adapter.
