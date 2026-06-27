---
finding: "Surface recommendation rationale"
catalog: "Direction"
impact:
  "Recommendation results would be more trustworthy if the UI explained why each title was picked."
base_commit: "0d31d46"
---

## Effort

M - shape rationale data and render compact UI without changing ranking.

## Risk

LOW - this can be presentation-only if ranking is left unchanged.

## Confidence

HIGH - the recommender computes interpretable signals that are not currently shown.

## Evidence

- `internal/anime/recommendations/profile.go:64-101` builds a taste profile from genres, themes,
  studios, demographics, airing preference, and recency.
- `internal/anime/recommendations/types.go:21-28` stores match counts for recommendation candidates.
- `templates/top_picks.gohtml:22-25` renders only anime cards for Top Picks.

## Resolution Approach

Extend the recommendation result view model with concise, user-readable rationale. Keep ranking
unchanged for the first iteration. Examples of acceptable rationale are matched genre/theme/studio
badges, “similar to titles in your watchlist,” or “because you watch recent airing shows,” but exact
copy should be generated from data already computed by the engine.

Avoid exposing raw scores or overly technical terms. The UI should stay compact enough for card
grids and the home carousel. If space is constrained, start with the full `/top-picks` page and
leave the home carousel unchanged.

Add recommendation tests that assert rationale is produced for candidates with
genre/theme/studio/demographic matches and omitted gracefully when signals are weak. Add template
tests or snapshots only if the repo already uses that pattern for similar UI.

Verify with `go test ./internal/anime/... ./templates` and `bunx tsc -p tsconfig.json --noEmit` if
any TypeScript changes are needed.
