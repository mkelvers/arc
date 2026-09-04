# Slice 2: AniList catalog lifecycle

## Objective

Reimplement the required AniList client, request lifecycle, snapshot/lease behavior, refresh input, and catalog normalization in core. AniList GraphQL documents and generated types remain in `@arc/shared/src/graphql/`.

## Behavior to understand

Inspect `packages/backend/src/anime/anilist/` including client, browse, home, hero, releases, release-calendar, and airing behavior. Identify which operations are still product requirements and which are historical or duplicate paths. Preserve provider validation, request boundaries, snapshot semantics, rate-limit behavior, and persisted catalog meaning.

## Core design

- Put catalog-facing AniList behavior under `packages/core/src/catalog/`.
- Import GraphQL operations only from `@arc/shared`'s GraphQL tree.
- Keep transport and persistence behind the operation that owns them.
- Inline one-use request values and transformations at their owner.
- Do not create policy files that only rename a boolean or forward a provider call.

## Consumers

Migrate catalog refresh/application operations, API catalog routes, and scheduler catalog work after their core operations exist.

## Remove after migration

Delete the replaced backend AniList client and catalog lifecycle modules, then remove backend-only GraphQL wiring if no remaining consumer owns it. Do not fix unrelated backend code after deletion.

## Focused checks

- Core tests with mocked AniList transport at the core boundary.
- Snapshot/lease and refresh persistence tests.
- Validation tests for malformed and partial AniList responses.
- GraphQL operation import inventory.

## Exit criteria

Core owns the required AniList lifecycle, shared owns only GraphQL infrastructure, consumers use core operations, and the corresponding backend lifecycle code is removed.
