# Arc engineering guide

Use this file when changing Arc. Read `CODE_STYLE.md` when a change introduces or removes code structure. Read `CODE_STANDARD.md` when a change crosses a trust boundary, changes state or lifecycle behavior, or needs repository verification.

## Work sequence

1. Inspect the owning route, module, component, tests, generated contracts, and configuration before editing. Completion means you can name the current owner, its production consumers, and the behavior that must remain stable.
2. Identify the smallest complete change. Keep route-specific behavior with the route, browser-safe shared behavior under `src/lib`, and server-only behavior under `src/lib/server`. Completion means every changed symbol has a clear owner.
3. Check the existing implementation before adding a helper, type, constant, wrapper, component, or file. Keep it only when it owns a rule, boundary, effect, lifecycle, or real repeated contract. Completion means the new symbol passes the questions in `CODE_STYLE.md`.
4. Validate untrusted input at its owning boundary. Preserve authentication, authorization, persistence ordering, provider policy, accessibility, and established product behavior. Completion means invalid input fails closed and upstream failures are not hidden by unrelated fallbacks.
5. Test the changed behavior through its public boundary. Run the smallest relevant check during development, then the repository gates listed in `CODE_STANDARD.md` when the change is complete. Completion means the relevant checks pass or their exact limitation is reported.
6. Review the diff for dead exports, obsolete comments, accidental generated-file edits, unrelated changes, and formatting errors. Completion means `git diff --check` passes and the final diff contains only the intended change.

## Ownership rules

- Routes own HTTP methods, authentication checks, response status, page composition, and user-facing wording.
- Server modules expose operations and own external protocols, persistence, caching, retries, and privileged transformations.
- Types live beside the behavior or boundary they describe. Do not create a global type catalog or duplicate provider types.
- `anilist/types.ts` owns the generated AniList media shape used across server anime code.
- `playback.svelte.ts` owns player lifecycle. Do not add wrappers that only forward player methods.
- Use the framework, browser, database, authentication library, and deployment configuration for behavior they already own.

## Security

- Authentication and authorization fail closed. Never invent or substitute a principal.
- Treat URL values, form data, headers, cookies, database JSON, provider responses, and imported files as untrusted until validated.
- Enforce ownership and permissions on every private read and mutation. Client visibility is not authorization.
- Keep secrets and privileged integrations in server-only modules. Do not expose tokens, provider payloads, internal errors, or personal data.
- Give resource limits an operational or security reason, enforce them at the boundary, and report them clearly.

## Domain notes

- Anime browse routes share `parseBrowseFilters`, `browseSearchParams`, and `browseSorts` only when their input and serialization contracts are identical.
- Provider adapters belong under `providers` when they translate provider inventory and stream protocols into `PlaybackProvider` and enforce provider policy.
- Stream host allowlists, referers, redirect limits, content-size limits, and playlist rewriting are protocol or security rules. Keep them in the owning server boundary.
- The internal episode refresh route is authenticated machine-facing code. Its `internal` path names its trust boundary.

## Commit convention

Use a minimal lowercase commit title in imperative style. Do not include a commit body unless explicitly requested.

## Review evidence

For cleanup or review work, report the files and consumers inspected, symbols deleted or retained and why, behavior changes, generated files excluded, checks run, runtime paths exercised, and remaining gaps. Analyzer output is evidence for investigation, not a reason to add abstractions.
