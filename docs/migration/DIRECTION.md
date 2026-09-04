# Migration direction

This is the controlling document for the replacement of `@arc/backend` with `@arc/core`.

## What is changing

The old backend package is a reference for product behavior and persisted meaning. Core is a new owner with a simpler architecture. The work is to understand what backend does, identify the fundamentals that are still required, and reimplement those fundamentals in core with explicit boundaries.

This is not a backend refactor. Do not copy backend's file layout, preserve its internal abstractions, or make its package green as an intermediate goal.

## Rules for every slice

1. Start from the relevant backend behavior and its production consumers.
2. Write the core owner around the domain rule, persistence boundary, provider boundary, or application operation that actually matters.
3. Keep the implementation direct. Do not add a helper, wrapper, export, constant, or file without an independent rule, boundary, side effect, lifecycle, or repeated contract.
4. Test the new core behavior through its public boundary in `tests/`.
5. Move consumers only when the core operation is ready.
6. Delete the replaced backend files in the same slice. Backend failures caused by that deletion are expected.
7. Do not repair unrelated backend imports, exports, types, or tests just to restore backend compilation.
8. Keep `@arc/shared` limited to shared GraphQL infrastructure and database infrastructure for now.
9. Delete provisional core modules that have no current owner (`player`, `audio`, `search`, `season`, and broad `types`) and reintroduce capabilities later at a real boundary.
10. Preserve database migrations, persisted records, ownership checks, provider truth, and observable product behavior unless the slice explicitly changes them.

## Integration model

`refactor/core-package` is the integration branch. Each slice is implemented on its own focused branch, with logical commits, then merged back into the integration branch. The integration branch is allowed to be broken between slices. Only after all slices pass their focused and integration checks should the result be merged into `main`.

There is no requirement to add a Git workflow or CI system. Verification is focused checks and direct runtime evidence appropriate to the slice.

## Completion

The migration is complete only when required backend behavior has a core owner, all production consumers use that owner, obsolete backend files are deleted, provisional modules without an owner are gone, and `@arc/backend` can be removed without compatibility shims.
