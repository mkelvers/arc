# Arc Engineering Guide

Arc is a production application. Every change must preserve that standard: code should be secure by default, easy to navigate, deliberately small, strongly typed, and unsurprising to both users and maintainers. Prefer the simplest complete solution, not the shortest patch and not the most elaborate architecture.

Read `CODE_STYLE.md` for Arc's directness and structural simplicity rules, and `CODE_STANDARD.md` for the detailed maintainability contract. When several correct designs exist, prefer the one with fewer concepts, shallower indirection, and clearer ownership.

## Core design

Apply KISS, YAGNI, DRY, separation of concerns, high cohesion, low coupling, encapsulation, testability, and the principle of least astonishment as practical decision tools rather than slogans. SOLID principles are useful when they make a real boundary clearer; they are not a reason to introduce interfaces, factories, dependency injection, wrappers, or layers that have only one implementation and no present need.

A module, function, type, or component must earn its existence. Before adding one, ask whether the behavior belongs in an existing cohesive module, whether it is reused, and whether naming the concept separately makes the caller easier to understand. Inline trivial one-use transformations when the inline expression is clearer. Extract code when it represents a meaningful domain rule, removes genuine repetition, isolates an effect, or can be tested independently. Do not split or combine files merely to optimize line counts.

Design from the stable owning boundary and the code's long-term steady state, not as a sequence of patches. Before adding a helper, constant, wrapper, or piece of state, identify the concrete reuse, policy, or invariant it represents; inline incidental one-use mechanics. Prefer maintained framework integrations and native platform behavior over locally rebuilding SDK loaders, lifecycle management, form parsing, or validation. After implementation, collapse scaffolding that no longer carries domain meaning.

Keep one authoritative implementation of repeated, domain-neutral operations. Small reusable parsing and validation helpers such as record checks, positive-integer parsing, text normalization, and date handling may share a focused utility module when their contracts are genuinely identical. Do not create a miscellaneous dumping ground: anime identity, provider behavior, watchlist rules, route state, and other domain concepts stay with their owning domain even if their implementation is small.

## Project structure

Place code at the narrowest stable boundary that owns it. Route-specific UI and logic belong beside that route. Browser-safe code shared by multiple routes belongs under `src/lib`. Server-only code, secrets, persistence, authentication, provider integrations, and privileged transformations belong under `src/lib/server`. Shared components belong under `src/lib/components` only when they are actually reused or form part of the application's component system. Placement under `src/lib` must be earned by actual reuse across routes or by a real browser/server domain boundary; it is not a place to hide code that made a route file look long.

Do not keep a directory solely to contain one tiny file unless the directory expresses a real domain boundary that is expected to contain cohesive behavior now. Do not add barrel files that only re-export one module. Conversely, do not flatten a domain merely to reduce the file count when doing so would mix unrelated responsibilities or weaken server/client boundaries. Moves must improve discoverability and import direction, not just relocate clutter.

Types live near the behavior whose contract they describe. Keep small shared, type-only contracts together where that improves discovery, but avoid global type catalogs and duplicate interfaces. Prefer inferred types where the inference is obvious and stable; add explicit types at public, persistence, network, and trust boundaries. Translate provider and database shapes into application-facing models at those boundaries instead of leaking external schemas throughout the UI.

## Routes

Routes own HTTP semantics, page composition, route-specific interaction, and user-facing failure wording. Put one-route mechanics beside the route instead of creating a shared helper merely to shorten a page.

Every server-loaded page sets the unprefixed `pageTitle` it owns; the root layout is the only place that formats the document title as `Arc — ${pageTitle}`, falling back to `Arc`. Do not add a `title.ts`, `documentTitle`, or per-page prefix/suffix helper.

Share a boundary parser between API and page routes only when they accept genuinely identical input; keep response shape, status codes, logs, and user-facing wording local when those semantics differ. Do not consolidate two routes merely because three lines look alike.

An API route that delegates to one deep server operation can be deliberately short; it still owns method, authentication, validation, and response mapping. Do not inline security-sensitive server protocols into route files to avoid a small adapter.

## Server modules

Server code should expose operations, not call chains. Prefer ordinary `async` functions whose errors are normal typed `Error` subclasses. Do not wrap a Promise in an Effect, convert it back at the caller, or add an adapter that takes the same arguments and returns the same result.

An integration adapter earns its existence by owning at least one concrete boundary concern: endpoint, authentication, headers, retry policy, timeout, response validation, provider identity, or translation into an application model. A facade that only groups imports into an object does not earn a file; import the owning operation directly.

Validate external responses, persisted JSON, headers, form values, and URL values once at the boundary. Do not repeat validation after a value has become a trusted application model, and do not replace runtime validation with an interface.

Keep caches and request coalescing with the operation whose freshness policy they implement. Avoid `cachedX`/`getX` split layers when one public function can own key normalization, cache lookup, and loading clearly; retain separate request and mapping stages when each is substantial and the split makes provider transformation testable.

Provider absence, optional enrichment failure, and fatal transport failure are different outcomes. Preserve those distinctions while removing wrappers; do not turn cleanup into silent fallback behavior.

Transport tests should prefer an ephemeral local HTTP server over assigning `globalThis.fetch`. When a provider's fixed external hosts make that impossible, keep any fetch replacement scoped to the test and restore it reliably; do not add a production pass-through fetch module solely to make mocking easier.

## TypeScript and Svelte

Follow the project formatter, linter, TypeScript configuration, Svelte 5 conventions, and the applicable guidance from the Google TypeScript Style Guide. Use strict types, discriminated unions, exhaustive handling, narrow interfaces, and validation at untrusted boundaries. Avoid `any`, unsafe assertions, wrapper objects, boxed primitives, and speculative generic abstractions. Generated code is not hand-refactored unless its generator or schema is changed with it.

Names should be concise, contextual, and meaningful. Avoid both sentence-length identifiers and cryptic abbreviations. A local `query` is preferable to repeating its full route context in every identifier, but several distinct values must not all be called `query` if that hides their roles. Booleans should read as conditions. Functions should describe the behavior or result they own. Comments are not a substitute for meaningful names.

Use comments to explain why a constraint exists, why an apparently simpler approach is unsafe, or how a non-obvious protocol or domain rule works. Do not narrate syntax that the code already states. Use short line comments for local reasoning and complete multiline comments for important invariants or protocols. Multiline formatting must expose structure and relationships; never wrap code solely to reduce the apparent line length or line count.

Keep Svelte state minimal and derive values rather than synchronizing duplicate state with effects. Use `$effect` only for a genuine side effect or synchronization with an external system, not for values that can be expressed with `$derived`, event handlers, form actions, URL state, or ordinary expressions. Avoid multiple names for the same route, form, and search value. Prefer server load functions and form actions for server-owned work, and keep client behavior focused on interaction.

## Security and production behavior

Authentication and authorization fail closed. Never invent a user ID, silently substitute a development identity, or use a fallback principal when a session or `locals.user` is absent. Reject unauthenticated requests with the appropriate redirect or error, and enforce ownership and permissions on the server for every mutation and private read. Client visibility is not authorization.

Treat URL parameters, form data, headers, cookies, database values, provider responses, imported files, and persisted JSON as untrusted until validated. Validate shape, type, range, and allowed values at the boundary. Avoid leaking secrets, tokens, internal errors, provider payloads, or personal data to the browser or logs. Keep secrets and privileged integrations in server-only modules. Use parameterized database operations and preserve CSRF, origin, cookie, and session protections supplied by the framework and authentication library.

Limits must have a documented operational or security reason. Do not impose arbitrary product restrictions such as a watchlist import maximum merely because a loop needs a guard. When protection against oversized input or resource exhaustion is necessary, choose a defensible boundary, report it clearly to the user, and apply streaming, batching, backpressure, or transaction design where appropriate. Security controls must not masquerade as unexplained product rules.

Do not hide upstream failures behind unrelated fallbacks. Preserve meaningful provider errors, degrade only optional enrichment, and make partial behavior explicit. Avoid compatibility code such as "legacy" slug or ID handling unless current persisted data or public links require it; document that evidence and provide a removal path.

## UI and styling

Use Tailwind CSS utilities and the tokens defined by the application theme. Fixed styling belongs in canonical utilities or shared theme CSS; runtime-dependent values may remain inline. Avoid empty elements used only to draw decoration when a pseudo-element, semantic element, or existing component is clearer.

Use a single typed `cn` helper backed by `clsx` and `tailwind-merge` when conditional or conflicting Tailwind classes are present. Plain static class strings do not need `cn`. Use a Svelte-compatible variant utility such as `class-variance-authority` only for a reused component with real variants or sizes; do not turn every component into a variant configuration. Defaults and variants should be explicit, typed, and part of the component's public contract.

A Svelte component earns its boundary by owning coherent markup, accessibility, interaction, or styling; it need not be generic or reused across unrelated products. Do not make a component generic only to broaden its name. Extract a shared primitive such as a modal only when existing consumers need the same focus management, dismissal, keyboard, backdrop, and accessibility contract; do not add a speculative wrapper around one dialog.

Keep a component's small `$props` interface in the Svelte file; it documents the component boundary and is required for useful type checking. Moving it to a global type file adds navigation without reuse.

Styling props such as `triggerClass` or `menuClass` must be justified by real caller-controlled variation; prefer a fixed internal class when every consumer passes the same value. If a component is only a fragment moved out to shorten a parent, verify that it owns a recognizable UI concept or independent interaction; otherwise put the markup back beside its owner.

UI components should be accessible, predictable, and restrained. Preserve semantic HTML, keyboard behavior, focus states, labels, and useful error messages. Do not add decorative controls or abstraction-heavy component APIs that the product does not need.

## Domain boundaries

The anime and player domains own rules that their modules must preserve even when they look small.

### Anime (browser-safe)

The shared browse boundaries are named rules, not conveniences: `parseBrowseFilters` because the page and API must validate the same untrusted URL parameters, `browseSearchParams` because browse navigation and pagination serialize one canonical URL representation, and `browseSorts` because the values simultaneously define the TypeScript union, accepted input, and visible choices. Search ranking and artwork inference are substantial deterministic algorithms with focused tests.

Use the repository's Zod convention only at browser-fetched JSON boundaries to validate unknown responses; use ordinary inferred TypeScript types behind that boundary.

Do not add generic option-unwrapping helpers, one-caller URL helpers, test-only production exports, or files containing only an obvious label expression; inline those mechanics where they are read. Labels that merely title-case provider enum values may stay shared only while several browse controls use the exact same transformation; if they become route-specific or have one visible caller, move the expression to that route.

### Server anime

Import concrete operations from their owning modules. Do not recreate the deleted `anime` aggregate, `anilist`/`tmdb` object facades, single-module barrels, or collection objects whose methods forward to local functions.

`anilist/types.ts` is the single owner of the generated AniList media shape used across providers, episodes, and TMDB enrichment. Import that type directly instead of redeclaring or re-exporting it in each subdomain; provider-specific types stay with their provider.

AniList and AllAnime client modules are allowed because they own different endpoints and transport policies. The shared GraphQL module owns HTTP behavior, bounded transient retries, payload validation, and diagnostic errors; do not add per-operation adapters around it.

Provider adapters under `providers` are meaningful when they translate a provider inventory and stream protocol into `PlaybackProvider`; a short adapter is not automatically shallow. An object that merely renames `getEpisodes` or `getStreams` without provider policy should be deleted.

Stream host allowlists, provider referers, redirect limits, content-size limits, and playlist rewriting are security or protocol rules, not incidental wrappers, even when an individual expression is short. Keep route-specific status codes and user-facing messages at the route boundary.

The internal episode refresh route is an authenticated machine-facing adapter; `internal` names its trust boundary. Do not remove or relocate it based on the folder name alone.

### Player

`playback.svelte.ts` is the lifecycle owner; do not add wrappers that repeat a method's arguments or return another media helper unchanged. Keep a helper such as subtitle-track matching while several playback decisions use the same rule; delete singular/plural aliases or compatibility wrappers that expose the same operation twice.

Localize a threshold used by one scoring or scheduling function. Keep a module constant only when multiple related algorithms share it or when it names an external protocol or security rule.

Do not export a helper solely so its test can import it; prefer testing through the public operation unless the helper is itself a substantial deterministic algorithm.

Timing and caption constants are behavior, not decoration. Before deleting or inlining one, inspect every algorithm and regression test that depends on it; a small shared tolerance can carry more correctness than its line count suggests.

## Refactoring and verification

### Deletion-first cleanup

For cleanup work, reduce the number of concepts before rearranging them. Check production call sites separately from tests, framework entry points, generated contracts, database schemas, and public exports. Delete dead files and exports first; inline incidental one-use mechanics next; localize one-function literals next; only then consider moving or extracting code.

Do not introduce a helper, facade, barrel, options object, adapter, or component merely to make a patch easier, satisfy an analyzer, or expose an internal for a test. A new production symbol must own a reused operation, a named domain rule, a trust boundary, an external effect, or a policy that is clearer when tested independently. A function that only calls another function with the same arguments and returns its result normally fails this test.

Prefer a small amount of obvious local repetition over a falsely generic abstraction. Do not remove repetition when the similar-looking callers have different error messages, ownership, lifecycle, security requirements, or product meaning. Analyzer findings are leads, never targets; a nonzero complexity or duplication score does not by itself justify a change.

Use braces for every conditional body. Put a blank line between independent guard clauses and between validation, transformation, effects, and return steps when those phases are easier to scan separately. Do not compress control flow merely because a formatter permits it.

Inspect call sites, tests, generated contracts, database constraints, and runtime behavior before changing a boundary. Preserve unrelated work in the tree. Refactors should normally keep behavior stable; when behavior must change, state the reason and cover it with focused tests. Delete obsolete files, exports, dependencies, comments, and compatibility paths once their consumers and data requirements are proven absent.

Prefer direct code over chains of tiny wrappers. Consolidate repeated logic only after confirming that the semantics are the same. A duplicated three-line expression can be clearer than a falsely generic abstraction; repeated validation with an identical contract should usually be shared. Constants are warranted for shared policy, protocol values, or values whose names add meaning—not merely because a literal can be moved to the top of a file.

Verification must match the risk. Run formatting and static checks, focused tests for changed behavior, the production build for structural changes, and `git diff --check`. Exercise representative runtime paths for authentication, persistence, imports, search, provider playback, and interactive UI changes. Compilation alone is not evidence that production behavior works.

When reviewing the repository, report concrete evidence rather than preferences: identify the owning concern, current consumers, duplication, trust boundary, behavioral risk, and smallest sound improvement. The goal is fewer concepts and clearer ownership while retaining every piece of complexity that protects correctness, security, accessibility, or an established product requirement.
