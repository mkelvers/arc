# Slice 6: user state and application operations

## Objective

Reimplement the required progress, watchlist, notifications, invitations, and related application fundamentals with clear ownership, without pulling route concerns into core.

## Behavior to understand

Inspect `packages/backend/src/progress/`, `watchlist/`, `notifications.ts`, `invitations.ts`, authentication boundaries, and their API routes. Preserve authorization, ownership, continuation history, completion semantics, and persistence ordering.

## Core design

- Keep private reads and mutations behind explicit authenticated application operations.
- Keep authentication checks and HTTP response behavior in routes.
- Keep user state separate from catalog metadata and provider inventory.
- Reintroduce only the types and schemas needed by a concrete operation; delete broad provisional types that have no current owner.

## Consumers

Migrate the corresponding API route modules and frontend calls after each public operation is ready. Scheduler behavior belongs to the scheduler slice unless it is required for persisted user state correctness.

## Remove after migration

Delete replaced backend progress, watchlist, notification, invitation, and duplicate contract modules. Do not repair remaining backend consumers after deletion.

## Focused checks

- Authorization and ownership tests.
- Progress continuation/completion tests.
- Watchlist mutation and transfer tests.
- API route checks for status and validation behavior.

## Exit criteria

Required user-state behavior has a core/application owner, private boundaries fail closed, consumers are migrated, and replaced backend modules are deleted.
