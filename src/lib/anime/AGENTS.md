# Browser-safe anime domain

This folder owns anime-facing models and rules that are safe to import in the browser. It must not become a catalog of one-off display helpers.

Good boundaries in this folder include:

- `parseBrowseFilters`, because both the page and API must validate untrusted URL parameters with the same contract.
- `browseSearchParams`, because browse navigation and pagination must serialize one canonical URL representation.
- `browseSorts`, because the values simultaneously define the TypeScript union, accepted input, and visible choices.
- Search ranking and artwork inference, because they are substantial deterministic algorithms with focused tests.
- Runtime schemas at browser-fetched JSON boundaries. TypeScript types disappear at runtime; use the repository's existing Zod convention to validate unknown responses, then use ordinary inferred TypeScript types behind that boundary.

Bad boundaries include generic option-unwrapping helpers, URL helpers used by one caller, test-only production exports, or a file containing only an obvious label expression. Inline those mechanics where they are read. Do not add another generic anime barrel or aggregate object.

Labels that merely title-case provider enum values may stay shared while several browse controls use the exact same transformation. If they become route-specific or have only one visible caller, move the expression to that route instead of widening this domain.
