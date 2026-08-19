# Arc code standard

This is Arc's maintainability contract. Use it when implementing, reviewing, or simplifying production code. It favors fewer concepts, clear ownership, and complete behavior over either minimal line count or extra architecture.

## Implementation checklist

1. Inspect production consumers separately from tests, generated files, framework entry points, schemas, and public exports. Completion means the change has a known boundary and no hidden consumer.
2. Validate URL parameters, response JSON, form data, headers, cookies, provider payloads, database JSON, and imported files at the owning boundary. Completion means later code uses the validated result, not the original unknown value.
3. Preserve security, state, lifecycle, and protocol invariants. Completion means the change does not weaken authentication, authorization, persistence ordering, cancellation, cleanup, cache freshness, provider restrictions, or accessibility.
4. Test through the public operation or route. Completion means tests cover changed behavior rather than test-only exports of private helpers.
5. Run the relevant checks and inspect the final diff. Completion means the checks pass, or the final report names the exact gap.

## Symbol admission

Keep a symbol when it owns a present fact:

- a domain rule or invariant;
- a contract reused by production callers;
- validation or translation at a trust boundary;
- an external effect or lifecycle;
- protocol, security, persistence, cache, retry, or timing policy;
- a substantial deterministic algorithm;
- a stable subsystem interface with meaningful implementation behind it.

Inline or delete symbols that only forward arguments, wrap one library call, rename an obvious expression, centralize an unrelated literal, duplicate another type owner, or exist only to make a test import possible. “Used twice” is evidence, not automatic approval.

## Boundaries

Routes own HTTP method checks, authentication, validation, status codes, response mapping, page composition, and user-facing errors. Share a parser only when two boundaries accept the same input contract. Keep their response and error semantics local.

Server operations should be ordinary typed `async` functions. Do not wrap promises in an effect abstraction or add facades that only group imports. An integration adapter must own a real endpoint, authentication scheme, header, retry, timeout, response validation, provider identity, or application-model translation.

Translate external and persisted shapes once. Do not leak provider or database schemas through the UI. Optional enrichment failure, provider absence, and fatal transport failure must remain distinguishable.

## Anime and player rules

- `parseBrowseFilters`, `browseSearchParams`, and `browseSorts` are shared browse boundaries. Keep their contracts aligned and do not add one-caller URL helpers.
- Use Zod at browser-fetched JSON boundaries. Use inferred application types after parsing.
- `anilist/types.ts` is the single owner of the generated AniList media shape. Provider-specific types stay with their providers.
- The shared GraphQL module owns AniList HTTP behavior, bounded transient retries, payload validation, and diagnostic errors.
- Provider adapters translate inventory and stream protocols into `PlaybackProvider`. Do not keep an adapter that only renames methods.
- Stream host allowlists, referers, redirect limits, content-size limits, and playlist rewriting are security or protocol policy.
- `playback.svelte.ts` owns player lifecycle. Keep timing and caption constants when they protect scheduling or synchronization behavior.

## State and persistence

Use one state value per independent writer. Derive pure values. Use `$effect` only for synchronization with an external system, and keep setup and cleanup in one lifecycle owner.

Capture request identity across async work and ignore stale results before writing state. Persistence ordering belongs at the database boundary. Keep transactions, constraints, and conditional updates when they protect durable invariants.

Cache code must make its key, owner, freshness, stale behavior, concurrent-request handling, cleanup, and refresh-failure behavior clear. Do not gather unrelated lifetimes into a constants file.

## Cleanup order

When code is over-engineered, simplify in this order:

1. Delete dead behavior, exports, files, dependencies, compatibility paths, and obsolete comments.
2. Inline one-use aliases, literals, wrappers, and mechanics that own no rule.
3. Remove mirrored state and calculation effects.
4. Consolidate only duplicated knowledge with identical ownership and failure behavior.
5. Deepen modules where callers coordinate internal state machines or effects.
6. Re-run formatting and static checks.
7. Exercise the real boundary in proportion to risk.

## Verification

Run the smallest relevant checks during implementation. Before finishing, run:

```sh
bun run format:check
bun run lint
bun run check
bun test
bun run build
git diff --check
```

Structural changes should also check dead exports, dead files, and import cycles. Authentication, persistence, import/export, search, provider, and interactive player changes need representative runtime validation when the environment permits it. Compilation alone is not production verification.

## Review report

A repository-quality review names the files and consumers inspected, dead surface deleted, symbols retained and why, behavior changes, generated files excluded, checks run, runtime paths exercised, and remaining gaps. Report concrete risks and evidence before preferences or summary.

## References

These references explain the underlying techniques. Arc's ownership and admission rules above take precedence.

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) for types, naming, aliases, assertions, and comments.
- [TypeScript narrowing and exhaustiveness](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) for closed unions and control-flow narrowing.
- [Svelte reactivity](https://svelte.dev/docs/svelte/$state), [`$derived`](https://svelte.dev/docs/svelte/$derived), and [`$effect`](https://svelte.dev/docs/svelte/$effect) for state and lifecycle ownership.
- [OWASP input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) for syntactic and semantic validation.
- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) for provider URL and redirect boundaries.
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/) for behavior-focused UI tests.
