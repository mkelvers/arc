# Slice 8: delete backend

## Objective

Remove `@arc/backend` after all required behavior and consumers have moved to core or an explicitly owned application boundary.

## Preconditions

- All preceding migration slices are merged into `refactor/core-package`.
- No production app imports `@arc/backend`.
- No package manifest depends on `@arc/backend`.
- Core and shared public entrypoints contain only intentional exports.
- Provisional core modules without a current owner are deleted.
- Top-level focused tests and integration checks pass.

## Work

- Remove the backend package and its package configuration.
- Remove backend-only generated output, tests, logger code, and utilities.
- Remove stale workspace dependencies and scripts.
- Search the entire repository for backend imports, paths, package names, and documentation references.
- Do not delete database migrations, persisted data, or shared GraphQL operations.

## Focused checks

- Workspace install/typecheck using the remaining packages.
- Top-level test suite with the required database configuration.
- API and scheduler startup checks.
- Full backend reference search returning no production matches.
- `git diff --check`.

## Exit criteria

The workspace no longer needs `@arc/backend`, core is the final implementation owner, and the integrated branch is ready for review before merging to `main`.
