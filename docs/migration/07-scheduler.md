# Slice 7: scheduler and maintenance

## Objective

Reimplement scheduled catalog refresh, episode synchronization, mapping repair, maintenance policy, and scheduler execution fundamentals with core operations owning domain behavior.

## Behavior to understand

Inspect `packages/backend/src/anime/scheduler/` and `apps/scheduler/src/worker.ts`. Separate scheduling triggers and process lifecycle from the catalog, metadata, episode, and maintenance operations that core owns.

## Core design

- Core owns the operation being scheduled.
- The scheduler app owns timing, job startup, and process-level failure reporting.
- Make job ordering and persistence effects explicit.
- Do not hide provider or database failures behind blanket fallbacks.

## Consumers

Migrate the scheduler worker and API maintenance routes to named core operations. Keep machine-facing authentication at the route or worker boundary.

## Remove after migration

Delete replaced backend scheduler and maintenance orchestration. Remove backend logger or utility dependencies only when their actual consumers have moved or been deleted.

## Focused checks

- Scheduler policy, target selection, reconciliation, and maintenance tests.
- Worker startup and failure propagation checks.
- One controlled end-to-end refresh/repair run against the configured database and providers.

## Exit criteria

Scheduler triggers core operations directly, lifecycle ownership is explicit, scheduled behavior is tested, and backend scheduler code is removed.
