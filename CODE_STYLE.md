# Arc code style

Arc code should be direct, shallow, local, and unsurprising. Prefer the smallest complete expression of a behavior at the boundary that owns it.

## Before adding structure

1. Read the owning file and its callers. Completion means you know whether the proposed code is route-specific, shared, server-only, generated, or part of a lifecycle.
2. Ask what knowledge the new symbol owns. Keep it only if it represents a domain rule, repeated contract, boundary translation, external effect, lifecycle, protocol or security policy, or substantial algorithm.
3. Put the symbol beside that knowledge. Completion means callers do not need to know the implementation detail it hides.
4. Delete scaffolding that no longer owns behavior. Completion means no pass-through wrapper, one-use alias, dead export, or single-fragment component remains without a concrete reason.

## Directness

Prefer code that performs the operation over code that calls another function that performs it. Keep ownership visible.

### Non-negotiable: inline one-use literals

Never extract a one-use set of literals into exported constants. Inline values such as catalog formats, thresholds, revisions, limits, and simple configuration directly where they are used. Names like `discoveryCatalogRevision`, `discoveryFormats`, `discoveryMinimumPopularity`, and `discoveryMinimumDuration` add no value when they have one caller and no independent interface.

Only name a value when it is reused, configurable, protects a non-obvious protocol/security/persistence/timing rule, or represents a substantial algorithm. “It makes the code shorter” is never sufficient.

```ts
if (event.url.pathname.startsWith('/api/')) {
    return new Response('Unauthorized', { status: 401 });
}
```

Do not add one-use aliases, obvious expression helpers, pass-through functions, object facades, forwarding handlers, speculative abstractions, or files that hide a few obvious lines.

Use a local when it distinguishes values, snapshots data across an async boundary, narrows a type, or names a non-obvious algorithmic intermediate. Do not use one only to shorten a property path.

## Control flow

Use braces for every conditional body. Use guard clauses for invalid, terminal, and unauthorized cases. Keep the normal path visible and keep one cohesive decision tree together.

```ts
if (invalidRequest) {
    return badRequest();
}

if (!session) {
    return unauthorized();
}

return performOperation();
```

Do not extract helpers just to reduce nesting or line count. Extract only when the name represents a real rule or the behavior is independently meaningful.

## Modules and files

A module should expose a small interface while hiding meaningful knowledge. Split a file only when each resulting module owns an independently changing concern, such as playback persistence ordering, caption alignment, HLS lifecycle, provider scheduling, or identity evidence.

Prefer this path:

```text
route -> owning operation -> external boundary
```

Avoid chains of handlers, services, managers, adapters, and helpers that mostly forward arguments. A layer is justified by authentication policy, provider protocol behavior, persistence invariants, cache or retry policy, transport translation, validation, lifecycle ownership, or a substantial algorithm.

Keep external effects at their owners: redirects in routes, writes in persistence modules, cookies at request boundaries, media operations in the player owner, DOM subscriptions in component lifecycle, and provider headers or retries in provider clients.

## State and configuration

Keep configuration near its owner. Inline an obvious one-use literal. Name a value when the name explains a shared protocol, security, business, timing, cache, or type rule.

In Svelte, every `$state` needs an independent writer. Use `$derived` for pure calculations and `$effect` only to synchronize an external system such as a timer, subscription, browser API, storage, or persistent controller. Do not mirror props or calculate values in effects.

## Types and UI

Use inference for obvious locals and explicit types at public, persistence, network, generated, and trust boundaries. Prefer concrete types and closed unions. Do not use `any`, non-null assertions, broad assertions, or speculative generics in handwritten production code.

Extract a component for coherent markup, accessibility, interaction, styling, or lifecycle. Do not extract a fragment only to shorten a parent or make a component generic. Keep small `$props` contracts in the Svelte file.

Use semantic HTML, labels, keyboard behavior, visible focus, live regions where needed, and correct alternative text. Use static Tailwind utilities for fixed styling and the project theme tokens for colors and spacing.

## Simplification test

For every new symbol, ask:

- What does it own?
- What complexity disappears for its callers?
- Would the caller be clearer if this code stayed inline?
- What would become incorrect if this layer disappeared?

If the answers are weak, simplify. Preserve complexity that protects security, authorization, persistence ordering, concurrency, lifecycle cleanup, caching, protocol behavior, accessibility, provider compatibility, validation, or established product behavior.
