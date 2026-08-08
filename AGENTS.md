# Arc Engineering Guide

Arc is a production application. Every change must preserve that standard: code should be secure by default, easy to navigate, deliberately small, strongly typed, and unsurprising to both users and maintainers. Prefer the simplest complete solution, not the shortest patch and not the most elaborate architecture.

## Core design

Apply KISS, YAGNI, DRY, separation of concerns, high cohesion, low coupling, encapsulation, testability, and the principle of least astonishment as practical decision tools rather than slogans. SOLID principles are useful when they make a real boundary clearer; they are not a reason to introduce interfaces, factories, dependency injection, wrappers, or layers that have only one implementation and no present need.

A module, function, type, or component must earn its existence. Before adding one, ask whether the behavior belongs in an existing cohesive module, whether it is reused, and whether naming the concept separately makes the caller easier to understand. Inline trivial one-use transformations when the inline expression is clearer. Extract code when it represents a meaningful domain rule, removes genuine repetition, isolates an effect, or can be tested independently. Do not split or combine files merely to optimize line counts.

Design from the stable owning boundary and the code's long-term steady state, not as a sequence of patches. Before adding a helper, constant, wrapper, or piece of state, identify the concrete reuse, policy, or invariant it represents; inline incidental one-use mechanics. Prefer maintained framework integrations and native platform behavior over locally rebuilding SDK loaders, lifecycle management, form parsing, or validation. After implementation, collapse scaffolding that no longer carries domain meaning.

Keep one authoritative implementation of repeated, domain-neutral operations. Small reusable parsing and validation helpers such as record checks, positive-integer parsing, text normalization, and date handling may share a focused utility module when their contracts are genuinely identical. Do not create a miscellaneous dumping ground: anime identity, provider behavior, watchlist rules, route state, and other domain concepts stay with their owning domain even if their implementation is small.

## Project structure

Place code at the narrowest stable boundary that owns it. Route-specific UI and logic belong beside that route. Browser-safe code shared by multiple routes belongs under `src/lib`. Server-only code, secrets, persistence, authentication, provider integrations, and privileged transformations belong under `src/lib/server`. Shared components belong under `src/lib/components` only when they are actually reused or form part of the application’s component system.

Do not keep a directory solely to contain one tiny file unless the directory expresses a real domain boundary that is expected to contain cohesive behavior now. Do not add barrel files that only re-export one module. Conversely, do not flatten a domain merely to reduce the file count when doing so would mix unrelated responsibilities or weaken server/client boundaries. Moves must improve discoverability and import direction, not just relocate clutter.

Types live near the behavior whose contract they describe. Keep small shared, type-only contracts together where that improves discovery, but avoid global type catalogs and duplicate interfaces. Prefer inferred types where the inference is obvious and stable; add explicit types at public, persistence, network, and trust boundaries. Translate provider and database shapes into application-facing models at those boundaries instead of leaking external schemas throughout the UI.

## TypeScript and Svelte

Follow the project formatter, linter, TypeScript configuration, Svelte 5 conventions, and the applicable guidance from the Google TypeScript Style Guide. Use strict types, discriminated unions, exhaustive handling, narrow interfaces, and validation at untrusted boundaries. Avoid `any`, unsafe assertions, wrapper objects, boxed primitives, and speculative generic abstractions. Generated code is not hand-refactored unless its generator or schema is changed with it.

Names should be concise, contextual, and meaningful. Avoid both sentence-length identifiers and cryptic abbreviations. A local `query` is preferable to repeating its full route context in every identifier, but several distinct values must not all be called `query` if that hides their roles. Booleans should read as conditions. Functions should describe the behavior or result they own. Comments are not a substitute for meaningful names.

Use comments to explain why a constraint exists, why an apparently simpler approach is unsafe, or how a non-obvious protocol or domain rule works. Do not narrate syntax that the code already states. Use short line comments for local reasoning and complete multiline comments for important invariants or protocols. Multiline formatting must expose structure and relationships; never wrap code solely to reduce the apparent line length or line count.

Keep Svelte state minimal and derive values rather than synchronizing duplicate state with effects. Use `$effect` only for a genuine side effect or synchronization with an external system, not for values that can be expressed with `$derived`, event handlers, form actions, URL state, or ordinary expressions. Avoid multiple names for the same route, form, and search value. Prefer server load functions and form actions for server-owned work, and keep client behavior focused on interaction.

## Security and production behavior

Authentication and authorization fail closed. Never invent a user ID, silently substitute a development identity, or use a fallback principal when a session or `locals.user` is absent. Reject unauthenticated requests with the appropriate redirect or error, and enforce ownership and permissions on the server for every mutation and private read. Client visibility is not authorization.

Treat URL parameters, form data, headers, cookies, database values, provider responses, imported files, and persisted JSON as untrusted until validated. Validate shape, type, range, and allowed values at the boundary. Avoid leaking secrets, tokens, internal errors, provider payloads, or personal data to the browser or logs. Keep secrets and privileged integrations in server-only modules. Use parameterized database operations and preserve CSRF, origin, cookie, and session protections supplied by the framework and authentication library.

Limits must have a documented operational or security reason. Do not impose arbitrary product restrictions such as a watchlist import maximum merely because a loop needs a guard. When protection against oversized input or resource exhaustion is necessary, choose a defensible boundary, report it clearly to the user, and apply streaming, batching, backpressure, or transaction design where appropriate. Security controls must not masquerade as unexplained product rules.

Do not hide upstream failures behind unrelated fallbacks. Preserve meaningful provider errors, degrade only optional enrichment, and make partial behavior explicit. Avoid compatibility code such as “legacy” slug or ID handling unless current persisted data or public links require it; document that evidence and provide a removal path.

## UI and styling

Use Tailwind CSS utilities and the tokens defined by the application theme. Fixed styling belongs in canonical utilities or shared theme CSS; runtime-dependent values may remain inline. Avoid empty elements used only to draw decoration when a pseudo-element, semantic element, or existing component is clearer.

Use a single typed `cn` helper backed by `clsx` and `tailwind-merge` when conditional or conflicting Tailwind classes are present. Plain static class strings do not need `cn`. Use a Svelte-compatible variant utility such as `class-variance-authority` only for a reused component with real variants or sizes; do not turn every component into a variant configuration. Defaults and variants should be explicit, typed, and part of the component’s public contract.

UI components should be accessible, predictable, and restrained. Preserve semantic HTML, keyboard behavior, focus states, labels, and useful error messages. Do not add decorative controls or abstraction-heavy component APIs that the product does not need.

## Refactoring and verification

Inspect call sites, tests, generated contracts, database constraints, and runtime behavior before changing a boundary. Preserve unrelated work in the tree. Refactors should normally keep behavior stable; when behavior must change, state the reason and cover it with focused tests. Delete obsolete files, exports, dependencies, comments, and compatibility paths once their consumers and data requirements are proven absent.

Prefer direct code over chains of tiny wrappers. Consolidate repeated logic only after confirming that the semantics are the same. A duplicated three-line expression can be clearer than a falsely generic abstraction; repeated validation with an identical contract should usually be shared. Constants are warranted for shared policy, protocol values, or values whose names add meaning—not merely because a literal can be moved to the top of a file.

Verification must match the risk. Run formatting and static checks, focused tests for changed behavior, the production build for structural changes, and `git diff --check`. Exercise representative runtime paths for authentication, persistence, imports, search, provider playback, and interactive UI changes. Compilation alone is not evidence that production behavior works.

When reviewing the repository, report concrete evidence rather than preferences: identify the owning concern, current consumers, duplication, trust boundary, behavioral risk, and smallest sound improvement. The goal is fewer concepts and clearer ownership while retaining every piece of complexity that protects correctness, security, accessibility, or an established product requirement.
