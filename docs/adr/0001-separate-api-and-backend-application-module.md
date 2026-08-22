# ADR 0001: Separate the Arc API and reusable backend application module

- Status: accepted
- Date: 2026-08-22

## Context

Arc previously combined presentation, HTTP handling, authentication, persistence, cache policy, provider coordination, and application rules in one SvelteKit deployment. That made the web app the only practical entry point to the system and would force a future background worker either to call Arc or to duplicate its rules.

Authentication, invitations, watchlists, catalog reads, anime details, media selection, playback progress, episode segments, provider playback, and stream proxying now cross this boundary. Arc no longer imports `@arc/backend` or `@arc/db` at runtime.

## Decision

Run a Bun-hosted Hono application in `apps/api`. Arc and the API are separate deployments, but the public router exposes them through one web origin: Arc owns page paths while `/v1/*` and `/api/auth/*` route to Hono. The API owns HTTP authentication, request validation, cookie-mutation origin checks, safe error mapping, and response serialization.

Put application operations in `packages/backend`. Operations accept authenticated principal IDs and ordinary typed values. They own authorization-sensitive persistence, cache policy, provider coordination, synchronization, and multi-step invariants. The package does not import SvelteKit, Hono, Request, or Response. It exposes useful operations rather than pass-through repository or manager layers.

Keep shared Zod wire schemas in `packages/api-contract`. Hono route modules validate request data, and Arc validates response JSON at its network boundary. The API stays an ordinary grouped Hono application without a generated description or client. Persisted JSON in `@arc/db` is typed as `unknown`; the backend module that owns each value validates it before use.

Arc browser and SSR code call the API. Browser requests use relative same-origin paths. SSR uses the private API origin and forwards only the incoming Cookie and Authorization headers. An authentication API outage is a `503`, not an unauthenticated session and not a login redirect.

Production routes `/v1/*` and `/api/auth/*` from Arc's HTTPS origin to the API deployment. Development uses the same paths through Vite's proxy. Better Auth therefore uses an ordinary host-only session cookie; cookies remain `HttpOnly` and `SameSite=Lax` and are `Secure` on HTTPS. Cookie-authenticated mutations require the configured Arc origin. Bearer sessions remain available for future first-party non-browser clients.

The production router applies these routes before Arc's fallback:

```text
/api/auth/* -> Hono API
/v1/*       -> Hono API
/*          -> Arc
```

This slice pins Better Auth to the schema-compatible 1.6.3 contract because 1.7 requires a new account issuer column and backfill. Upgrading Better Auth therefore requires a separate, explicit database migration; it is not part of this no-schema-change cutover.

A future worker imports `@arc/backend` directly. It schedules and invokes application operations; it does not call Arc, own alternative business rules, or require an HTTP round trip.

## Consequences

- The API must be deployed and ready before Arc's public router sends `/v1/*` and `/api/auth/*` traffic to it.
- API and Arc deploy independently but share additive-compatible `/v1` contracts. Breaking wire changes require `/v2`.
- New server behavior is added through `@arc/backend` and exposed by Hono rather than being implemented inside Arc.
- The worker, queue, scheduler, and notification data model are explicitly outside this decision's implementation.
