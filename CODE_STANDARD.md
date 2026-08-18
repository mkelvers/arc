# Arc Code Standard

This is Arc's maintainability contract. It is deliberately stricter and more concrete than a generic list of KISS, DRY, SOLID, or clean-code slogans. Those ideas are useful only when they reduce the number of concepts a maintainer must understand without hiding behavior that protects playback, identity, persistence, security, or accessibility.

The target is the smallest **complete** design at its long-term boundary. Neither fewer lines nor more abstractions is automatically better.

## The governing test

Every production symbol must answer two questions:

1. What knowledge does this symbol own?
2. Why is that knowledge clearer here than directly at its caller?

If the answers are only “convenience,” “shorter lines,” “avoids typing the property path,” “might be reused,” or “makes the test easy,” remove the symbol.

A symbol earns its existence when it owns at least one present fact:

- a domain rule or invariant;
- one contract reused by real production callers;
- a trust-boundary translation or validation;
- an external effect or lifecycle;
- a protocol, security, persistence, cache, or timing policy;
- a substantial deterministic algorithm whose name hides implementation detail;
- a stable subsystem interface that makes its implementation meaningfully deeper than its surface.

This is an admission rule, not a deletion quota. A three-line function that enforces monotonic playback writes is justified. A one-line function that merely returns `Schema.safeParse(value).success` is not.

## Symbol admission rules

Use this table during implementation and review.

| Symbol | Keep it when | Inline or delete it when |
| --- | --- | --- |
| Local variable | It distinguishes two simultaneous values, snapshots mutable data across async work, narrows a type, or names a non-obvious intermediate in an algorithm | It aliases a property for one use, renames an already-clear value, or only shortens a line |
| Module constant | The name explains a protocol/security/business rule, identity matters, or the value is a reusable lookup/type source | It merely creates a “central place” for an obvious literal, repeats the call site's meaning, or is justified only by easier future changes |
| Function | It owns a rule, repeated contract, boundary, effect, or substantial algorithm | It forwards arguments, wraps one library call, formats one obvious one-use expression, or exists only for a test import |
| Interface/type | It is a public/boundary contract, a closed domain model, or repeated structural shape | It names one local object literal without making the contract clearer, duplicates another owner, or uses generics to avoid writing a simple type |
| Class/controller | It protects stateful invariants behind a smaller interface and owns a lifecycle | It is a bag of callbacks/state, has one shallow method per field, or needs reader lambdas and forwarding wrappers to function |
| Component/file | It owns a coherent UI, interaction, lifecycle, or domain boundary | It only shortens its parent, contains one incidental fragment, or re-exports one other module |
| `$state` | The value can change independently because of user input, network/DOM lifecycle, or an external event | It mirrors a prop, duplicates another state value, or can be calculated from current state |
| `$derived` | The value is a pure function of reactive inputs | It performs I/O, writes state, or merely aliases another reactive property |
| `$effect` | It synchronizes with a browser API, timer, subscription, persistent controller, or other external lifecycle | It computes data, copies props into local state, responds to an event that can be handled at the event site, or compensates for duplicate state |

“Used twice” is evidence, not automatic approval. Two identical expressions may still have different ownership or error behavior. Conversely, a one-use protocol or database invariant may deserve a name because the name explains why the code exists.

## Direct code and local variables

Do not introduce a local merely to avoid reading the owning path:

```ts
// Rejected: no distinction or snapshot is introduced.
const id = this.user.id;
await load(id);

// Required.
await load(this.user.id);
```

```ts
// Rejected inside player-specific code.
const media = player.media;
media.togglePlayback();

// Required: ownership stays visible.
player.media.togglePlayback();
```

A local is correct when it captures a value before an async boundary or distinguishes old and incoming state:

```ts
const episode = { animeId, episodeId };
const response = await fetch('/api/episodes/skip-times', options);

if (episode.episodeId !== this.episode.episodeId) {
    return;
}
```

That local protects a race; it is not cosmetic.

Do not equate “inline everything” with dense expressions. Name algorithmic intermediates such as `coverage`, `estimatedServerTime`, or `episodeChanged` when they expose a decision. Put validation, transformation, effects, and return phases in separate paragraphs when that makes the flow scan faster.

## Constants and configuration

Module-level constants are not a default home for literals, and “one place to change it” is not sufficient justification. Code is read far more often than a fixed value changes; moving the value away from its operation adds navigation and vocabulary now.

Inline a literal when it is used once and its call site already gives it meaning:

```ts
// Rejected.
const browsePageSize = 42;
const page = await getBrowsePage(filters, number, browsePageSize);

// Required, even when the same obvious page size appears at the matching
// database limit/offset checks.
const page = await getBrowsePage(filters, number, 42);
```

Keep a constant when multiple pieces of code must agree on the value or when it defines a real lookup/type contract:

```ts
const subtitleSizes = {
    small: { label: 'Small', px: 24 },
    normal: { label: 'Normal', px: 32 },
    large: { label: 'Large', px: 40 },
} as const;

type SubtitleSize = keyof typeof subtitleSizes;
```

Two occurrences do not automatically create a constant. Fixed presentation durations, page sizes, and obvious batch limits may remain literal at their owning calls when the APIs make their roles clear. Keep a named value only when its **name** communicates a reason or invariant that the literal and call cannot.

For example, a hero's `setTimeout(..., 15_000)` and `style:animation-duration="15s"` can stay at their respective browser boundaries. `const rotationDurationMs = 15_000` does not actually unify milliseconds and CSS text; it only adds a name and interpolation.

Cache and retry values follow the same rule:

- Inline a lifetime passed to one cache constructor.
- Name it when freshness checks, cleanup, scheduling, or multiple cache instances must share a non-obvious operational policy and the name explains that policy.
- Include units in a policy name when the call site does not make them obvious.
- Do not gather unrelated lifetimes into a “constants” file.
- Security and protocol limits stay beside their enforcement and include a reason when the value is not self-evident.

A literal repeated accidentally is not yet policy. A value compared in several stages of one cache or lease algorithm is policy.

## Functions and control flow

### Extraction test

Before extracting a function, verify at least one:

- changing the rule should change every caller together;
- the function can be named in domain language rather than mechanical language;
- it turns untrusted input into a trusted result;
- it isolates I/O, cleanup, or a browser lifecycle;
- its algorithm is easier to test and understand independently than inline.

Do not extract `metadataLabel` plus `titleCase` if `titleCase` is used only by that formatter and the inline mapping is clearer. Do not create `percentage()` in a global utility module for two progress bars; keep the calculation with the timeline unless a second domain independently needs the exact same clamping contract.

Short domain functions such as `currentAnimeSeason()` are justified when several routes need the same UTC calendar rule. Their size is not the deciding factor.

### Conditionals

Conditionals are not code smell by count. They are bad when they mix unrelated decisions or obscure state transitions.

- Use guard clauses for invalid/terminal cases.
- Use a `switch` for one closed discriminated union when exhaustive handling is useful.
- Keep a cohesive scoring or fallback decision tree together; do not scatter it across tiny helpers or a clever generic table.
- Prefer a declarative schema/codec when parsing and serializing the same boundary would otherwise duplicate a long conditional field list.
- Never compress branches merely to reduce lines.
- Always use braces for conditional bodies.

`browseSearchParams` and `parseBrowseFilters` are one bidirectional URL boundary. They should share one codec. Search relevance is a scoring algorithm; explicit ordered branches are clearer than an abstraction that hides their priority.

### Exports

Default to private. Export only for production consumption or a substantive policy/algorithm whose direct tests protect important behavior. Do not export an internal solely because a unit test wants access. Test through the public owner unless the internal is itself the meaningful contract.

Delete barrels that merely re-export one module or duplicate the real import path.

## Modules must be deep

A useful module exposes a small stable interface while hiding significant implementation knowledge. File count and line count are not architecture metrics.

Split a module when the new module can hide one independently changing concern, such as:

- playback progress ordering and persistence;
- caption provenance/alignment;
- HLS source lifecycle;
- manual skip-segment persistence;
- AniList request scheduling;
- TMDB identity evidence.

Do not split code merely into `helpers.ts`, `utils.ts`, or one method per file. A shallow split that replaces direct calls with callbacks, factories, readers, adapters, or prop forwarding makes the system harder even if each file is shorter.

For a stateful subsystem such as the player:

- one owner keeps the persistent player identity across episode changes;
- private player components may receive that owner directly instead of reconstructing callback/configuration bundles;
- progress, captions, segments, and media lifecycles may be separate modules only when each hides its own state machine or external effect;
- the top-level Svelte component renders the boundary and synchronizes incoming props; it must not know every internal tracker and save protocol;
- a split is successful only if callers know fewer concepts afterward.

For shared UI components, prefer narrow props. Passing a subsystem controller is acceptable only when the component is private to that subsystem and the controller is its actual owner. A generic `Modal`, `Dropdown`, or `AnimeCard` must not depend on a page-sized controller.

## TypeScript contracts

Use inference for obvious locals. Add explicit types at public module interfaces, HTTP/provider/database boundaries, persisted JSON, and places where inference would make a reader evaluate a complex expression.

- Prefer an interface for a named object contract.
- Prefer a union for closed alternatives and handle it exhaustively where behavior differs.
- Do not add generics when a plain concrete type expresses current callers.
- Do not use mapped or conditional types merely to save repeated field declarations.
- Do not use `any`, non-null assertions, `@ts-ignore`, or broad assertions in handwritten production code.
- An assertion is allowed only at a boundary where runtime evidence already proves the narrower type and TypeScript cannot express that evidence; keep it local and explain the proof.
- Generated files are changed through their generator/schema, never hand-cleaned.

Names are contextual. In a browse module, `filters` is better than `parsedBrowseSearchFilterValues`. In a scope containing current, incoming, and persisted values, qualify all three. Booleans read as conditions (`hasPlayed`, `canEdit`, `episodeChanged`).

## Runtime validation and schemas

URL parameters, response JSON, form data, headers, cookies, provider payloads, database JSON, and imported files are `unknown` until the owning boundary validates them.

Use the parsed output; do not validate and continue with the original value. Export a schema when callers need the trusted parsed model:

```ts
const result = AnimeCardPageSchema.safeParse(await response.json());
if (!result.success) {
    throw new Error('Arc returned an invalid anime page');
}

anime = result.data.anime;
```

Do not add this surface:

```ts
export function isAnimeCardPage(value: unknown) {
    return AnimeCardPageSchema.safeParse(value).success;
}
```

It throws away parsed data and hides the error contract without adding policy.

Use a Zod codec when one model has a real bidirectional transport representation, such as canonical browse URL parameters. Do not use a codec merely to look advanced. A one-way provider response still needs an ordinary schema/parser.

Validate syntactic shape and semantic rules: ranges, allowed values, ownership, cross-field constraints, and resource limits. Client validation improves UX; server validation is authoritative.

## Svelte 5 state and lifecycle

### State budget

Each `$state` must have an independent writer. If no event/effect assigns it independently, it is probably derived or incidental.

- Group values into an object when they form one interaction state and change as one unit, such as timeline pointer preview/position/scrubbing.
- Do not group unrelated lifecycle values merely to make the declaration block shorter.
- Do not mirror props into state unless preserving an accepted snapshot is the feature.
- Prefer getters or `$derived` for cheap calculations.
- Prefer one derived object when several outputs are one calculation, such as played and buffered percentages.
- Do not create `$derived(player.media)` or another alias of an already-reactive property.

### Effects

Every `$effect` requires an external-system sentence: “This effect keeps X synchronized with Y.” Allowed examples include a timer, DOM subscription, browser storage, a persistent class instance, or cancellation of an async prop request.

If the sentence is only “when A changes, assign B,” replace it with `$derived`, an event handler, or a single owning state value.

Use `onMount` when work requires bound DOM nodes or a component-lifetime resource. Cleanup must be returned by the same lifecycle owner. Do not distribute one subscription's setup and cleanup across components.

When a class must survive prop changes, construct it once from an initial snapshot and call one typed `sync()` boundary. Avoid reader lambdas for each prop and avoid one effect per field.

### Component extraction

Extract a component for a coherent UI or interaction boundary, not because a file crossed a line threshold. A 250-line settings menu may be coherent; a 40-line extracted fragment may be shallow. Conversely, a player control surface, settings menu, and timeline each own distinct interactions and can be private player components.

## Markup and formatting

The formatter is part of the standard. Arc uses Oxfmt with preserved object wrapping, whitespace-insensitive Svelte layout, and a 115-column Svelte override.

- A tag with only one ordinary attribute stays on one line when the configured Svelte width permits it: `<div class="…">`.
- A tag with several attributes breaks one attribute per visual line when it does not fit.
- Do not put `{#if}`, an element, and `{/if}` on one line.
- Adjacent children such as text, icons, and screen-reader labels remain visibly separate.
- Preserve manually multiline object literals and intersections when line breaks expose their structure.
- Do not fight the formatter with ignores for ordinary markup.
- Let editors soft-wrap long Tailwind strings; source wrapping should reveal attributes and structure, not make an element look empty.

Use static Tailwind utilities for fixed styling. Runtime-dependent dimensions, positions, colors, and CSS custom properties may use inline styles. Duplicating a dynamic value into a `data-*` attribute does not replace the style and should be removed unless tests or behavior consume the data attribute.

Keep semantic HTML, labels, keyboard behavior, focus visibility, live regions, and correct alternative text. Decorative images use `alt=""`; meaningful standalone artwork uses the anime title or equivalent context.

## Async work, caches, and persistence

Async locals are justified when they make stale-result protection explicit. Capture the request or identity, cancel/ignore obsolete work, and compare against the current owner before writing state.

Cache code must state:

- the cache key and data owner;
- freshness and stale behavior;
- coalescing behavior for concurrent requests;
- persistence and cleanup policy;
- what happens when refresh fails.

Do not centralize every lifetime as a constant. Do not delete named freshness/lease rules that several phases must share.

Persistence ordering belongs at the database boundary. UI state cannot be the only defense against stale playback, watchlist, notification, or synchronization writes. Transactions, constraints, and conditional updates retain names even when their expressions are short because they protect durable invariants.

## Comments

Comments explain why a simpler-looking implementation is unsafe, why a provider/protocol exception exists, or what invariant an algorithm protects. They do not narrate syntax or compensate for a vague name.

Use JSDoc for exported contracts that need usage or invariant documentation. Use line comments for local implementation reasoning. Remove comments made obsolete by a refactor.

## Deletion-first workflow

For cleanup and review, use this order:

1. Inventory handwritten production files, tests, generated code, and framework entry points.
2. Trace production consumers separately from tests.
3. Delete dead files, exports, dependencies, compatibility paths, and comments.
4. Inline one-use aliases, literals, wrappers, and mechanics that own no rule.
5. Remove mirrored state and calculation effects.
6. Consolidate only duplicated **knowledge** with identical ownership and failure behavior.
7. Deepen modules where callers currently coordinate internal state machines or effects.
8. Re-run format and static checks before judging the resulting source shape.
9. Exercise the real boundary in proportion to risk.

Analyzers are evidence sources, not scoreboards. Knip, duplication reports, complexity counts, line counts, and dependency graphs locate candidates. Never create an abstraction solely to silence one.

## Required review evidence

A repository-quality refactor reports:

- exact files or directory scope reviewed;
- production consumers traced;
- dead surface deleted;
- aliases/constants/helpers/state/effects removed or retained and why;
- behavior-changing fixes separately from behavior-preserving cleanup;
- generated files excluded;
- focused tests and repository gates run;
- runtime paths exercised and any gap.

Do not claim “production verified” from compilation alone. A redirect, 403, provider skip, or mocked test is not authenticated browser or live playback evidence.

## Verification gates

Run the smallest relevant loop during work, then the repository gates:

```sh
bun run format:check
bun run lint
bun run check
bun test
bun run build
git diff --check
```

Structural work should also check dead exports/files and cycles. Provider, authentication, persistence, import/export, search, and interactive player work require representative runtime validation when the environment permits it.

## Primary references

These sources inform the rules above; they do not override Arc's concrete admission tests.

- [Parnas, “On the Criteria To Be Used in Decomposing Systems into Modules”](https://john.cs.olemiss.edu/~hcc/csci555/notes/localcopy/Parnas_Criteria_Decomposing.pdf) — decompose around hidden design decisions, not execution steps.
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — inference, simple type constructs, assertions, aliases, naming, and informative comments.
- [TypeScript narrowing and exhaustiveness](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) — control-flow narrowing, discriminated unions, and `never`.
- [Svelte `$state`](https://svelte.dev/docs/svelte/$state), [`$derived`](https://svelte.dev/docs/svelte/$derived), and [`$effect`](https://svelte.dev/docs/svelte/$effect) — reactive ownership and external synchronization.
- [Zod codecs](https://zod.dev/codecs) — bidirectional boundary models and parsed output.
- [Oxfmt configuration](https://oxc.rs/docs/guide/usage/formatter/config) — committed formatter behavior and overrides.
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) — early syntactic/semantic server validation and allowlists.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — provider URL and redirect boundaries.
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/) — behavior-focused UI tests.
