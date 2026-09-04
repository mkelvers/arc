# Core migration branch strategy

`refactor/core-package` is the integration branch for this replacement. It collects focused migration branches before anything is merged into `main`.

## Branches

Each branch has one migration concern, a small set of logical commits, and focused checks. Branch names describe the new core owner rather than the old backend file.

Recommended order:

1. `refactor/core-anilist-catalog` — AniList lifecycle and catalog application boundary.
2. `refactor/core-episode-domain` — catalog-owned episode metadata and synchronization.
3. `refactor/core-tmdb-metadata` — TMDB metadata and mapping fundamentals.
4. `refactor/core-provider-playback` — provider inventory and playback foundations when their owner is ready.
5. `refactor/core-user-state` — progress, watchlist, notifications, and related application state.
6. `refactor/core-scheduler` — scheduler behavior and machine-facing orchestration.
7. `refactor/delete-backend` — final consumer removal and deletion of `@arc/backend`.

Branches may be stacked when a later slice depends on an earlier one. Merge each completed branch back into `refactor/core-package`, run the integration checks there, and only merge the integrated result to `main` after the backend deletion slice passes.

## Commit rules

- Keep commits focused on one logical migration or deletion.
- Delete the old backend implementation in the same slice that establishes its core replacement when practical.
- Do not add commits whose only purpose is to make the temporary backend compile.
- Do not add compatibility exports or wrappers unless a current, explicitly owned consumer requires them.

## Verification

There is no need to introduce a Git workflow or CI system for this migration. Each branch gets the smallest relevant typecheck and tests. The integration branch additionally runs the package checks that remain meaningful while backend is intentionally incomplete, plus `git diff --check` and an import/dependency inventory.
