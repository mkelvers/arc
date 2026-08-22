# ADR 0001: Separate the Arc API and reusable backend application module

- Status: accepted
- Date: 2026-08-22

## Context

Arc previously combined presentation, HTTP handling, authentication, persistence, cache policy, provider coordination, and application rules in one SvelteKit deployment. That made the web app the only practical entry point to the system and would force a future background worker either to call Arc or to duplicate its rules.

The first migration slice covers authentication, invitations, and watchlist behavior. Other server features remain in Arc temporarily and are migrated slice by slice.

## Decision

Run a Bun-hosted Hono application in `apps/api` at a dedicated API origin. Business endpoints are versioned under `/v1`; Better Auth keeps its conventional `/api/auth/*` paths. The API owns HTTP authentication, request validation, credentialed CORS, cookie-mutation origin checks, safe error mapping, response serialization, and liveness/readiness endpoints.

Put application operations in `packages/backend`. Operations accept authenticated principal IDs and ordinary typed values. They own authorization-sensitive persistence, cache policy, provider coordination, synchronization, and multi-step invariants. The package does not import SvelteKit, Hono, Request, or Response. It exposes useful operations rather than pass-through repository or manager layers.

Keep shared Zod wire schemas in `packages/api-contract`. Hono route modules validate request data, and Arc validates response JSON at its network boundary. The API stays an ordinary grouped Hono application without a generated description or client. Persisted JSON in `@arc/db` is typed as `unknown`; the backend module that owns each value validates it before use.

Arc browser and SSR code call the API. Browser requests use the public API origin with credentials. SSR forwards only the incoming Cookie and Authorization headers. An authentication API outage is a `503`, not an unauthenticated session and not a login redirect.

Production uses an HTTPS API subdomain and a shared parent-domain session cookie. Better Auth cookies remain `HttpOnly` and `SameSite=Lax`, are `Secure` on HTTPS, and use the configured parent domain. Credentialed CORS permits only the configured Arc origin. Cookie-authenticated mutations also require that exact Origin. Bearer sessions remain available for future first-party non-browser clients.

This slice pins Better Auth to the schema-compatible 1.6.3 contract because 1.7 requires a new account issuer column and backfill. Upgrading Better Auth therefore requires a separate, explicit database migration; it is not part of this no-schema-change cutover.

A future worker imports `@arc/backend` directly. It schedules and invokes application operations; it does not call Arc, own alternative business rules, or require an HTTP round trip.

## Consequences

- The API must be deployed and made ready before Arc is configured to use it.
- API and Arc deploy independently but share additive-compatible `/v1` contracts. Breaking wire changes require `/v2`.
- Each later migration moves a complete dependency closure and deletes the corresponding Arc server implementation. Temporary unmigrated Arc features may still use server modules and `@arc/db`.
- The worker, queue, scheduler, and notification data model are explicitly outside this decision's implementation.
