# Arc Code Style

Arc code should be direct, shallow, local, and unsurprising.

The preferred implementation is the smallest **complete** expression of the behavior at the boundary that owns it. Do not add architecture merely because architecture can be added. Do not turn simple behavior into a network of helpers, wrappers, variables, handlers, services, adapters, or files.

A maintainer should normally be able to open the owning file, read from top to bottom, and understand what happens without following a chain of incidental abstractions.

`CODE_STANDARD.md` contains the detailed maintainability rules. This document defines the shape Arc code should naturally converge toward.

## Directness

Prefer code that does the thing over code that describes another function which eventually does the thing.

```ts
// Avoid.
const isApi = event.url.pathname.startsWith("/api/");

if (isApi) {
  return handleApi(event);
}

// Prefer when the distinction has no independent meaning.
if (event.url.pathname.startsWith("/api/")) {
  return new Response("Unauthorized", { status: 401 });
}
```

Do not introduce a symbol merely to make the next line shorter.

Do not create:

* one-use aliases for properties;
* one-use helpers for obvious expressions;
* pass-through functions;
* object facades around ordinary functions;
* handlers whose only job is calling another handler;
* files whose only purpose is hiding three obvious lines;
* abstractions justified by possible future reuse;
* configuration expressed as runtime application code when the platform already owns it.

Every abstraction introduces another concept the reader must understand. It must remove more complexity than it adds.

## Minimize indirection

The number of functions, files, and layers between a boundary and its behavior should be as small as correctness allows.

Avoid flows like:

```text
route
→ handler
→ service
→ manager
→ adapter
→ helper
→ library
```

when most layers only forward arguments.

Prefer:

```text
route
→ owning domain operation
→ external boundary
```

A layer is justified when it hides real knowledge such as:

* authentication or authorization policy;
* provider protocol behavior;
* persistence invariants;
* cache or retry policy;
* transport translation;
* validation of untrusted data;
* lifecycle or resource ownership;
* a substantial algorithm.

A layer is not justified because its name sounds architectural.

## Keep the owning path visible

Do not rename an already-clear value just to avoid reading its owner.

```ts
// Avoid.
const path = event.url.pathname;

if (path.startsWith("/api/")) {
  ...
}

// Prefer.
if (event.url.pathname.startsWith("/api/")) {
  ...
}
```

```ts
// Avoid.
const media = player.media;
media.togglePlayback();

// Prefer.
player.media.togglePlayback();
```

Local variables are useful when they create an actual distinction:

```ts
const requestedEpisode = episode.id;
const response = await loadEpisode();

if (requestedEpisode !== episode.id) {
  return;
}
```

The variable exists because it protects an asynchronous invariant, not because the property path was inconvenient.

## Do not name every condition

A boolean local should represent a meaningful state or decision, not merely rename a comparison.

```ts
// Avoid.
const isAuth = event.url.pathname.startsWith("/api/auth/");
const isApi = event.url.pathname.startsWith("/api/");
const isLoggedIn = Boolean(session);

if (isApi && !isLoggedIn) {
  ...
}
```

Prefer keeping simple conditions where their consequences are visible:

```ts
if (event.url.pathname.startsWith("/api/") && !session) {
  return new Response("Unauthorized", { status: 401 });
}
```

Name a condition when the name communicates domain meaning that the expression does not:

```ts
const episodeChanged =
  current.animeId !== incoming.animeId ||
  current.episodeId !== incoming.episodeId;
```

The goal is not to eliminate variables. The goal is to eliminate vocabulary that adds no knowledge.

## Prefer shallow control flow

Use guard clauses and early returns for exceptional, terminal, and disallowed cases.

```ts
if (!session) {
  redirect(303, "/login");
}

return loadApplication();
```

Prefer this over nesting the main behavior inside increasingly deep branches.

```ts
// Avoid.
if (session) {
  if (user.active) {
    if (user.canWatch) {
      return loadApplication();
    }
  }
}
```

The normal path should remain visually obvious.

Independent decisions should appear as independent guards:

```ts
if (invalidRequest) {
  return badRequest();
}

if (!session) {
  return unauthorized();
}

if (!permission) {
  return forbidden();
}

return performOperation();
```

Do not create helpers merely to make the nesting disappear. Remove unnecessary states and branches first.

## Organize around purpose, not execution steps

A file should describe the highest-order purpose of its boundary.

A route hook should read like:

```text
bypass exceptional routes
verify clearance
resolve authentication
enforce route access
continue
```

It should not read like:

```text
calculate path
calculate route ID
calculate API boolean
calculate auth boolean
prepare context
call verification wrapper
call authentication wrapper
call routing helper
call response helper
```

The first describes application policy.

The second describes implementation mechanics.

Arc prefers the first.

## Let structure carry policy

Do not repeatedly rediscover information at runtime when the project structure can state it once.

Prefer route groups such as:

```text
routes/
├── (public)/
├── (auth)/
└── (app)/
```

over maintaining lists of special route IDs in a central hook.

Then authorization can remain structural:

```ts
if (event.route.id?.startsWith("/(app)/") && !session) {
  redirect(303, "/login");
}
```

rather than:

```ts
if (
  route !== "/home" &&
  route !== "/anime/[id]" &&
  route !== "/about" &&
  !session
) {
  redirect(303, "/login");
}
```

Prefer making invalid architecture difficult to express instead of compensating for it with more code.

This principle applies beyond routes:

* use server-only directories instead of repeatedly checking whether code may access secrets;
* use database constraints instead of relying only on UI checks;
* use types for closed application states instead of repeatedly validating internal combinations;
* use framework lifecycle boundaries instead of recreating lifecycle management manually.

## Use the framework and platform

Do not rebuild behavior already owned by the framework, runtime, deployment platform, authentication library, browser, or database unless Arc has a concrete requirement they cannot satisfy.

Application code should primarily contain application behavior.

For example, static HTTP security headers usually belong in deployment or server configuration when that layer can express them declaratively.

Avoid turning:

```text
set these five headers on every response
```

into an application subsystem containing:

```text
securityHeaders handle
→ resolve
→ clone headers
→ mutate headers
→ reconstruct response
```

when the hosting layer can own the same policy directly.

The security policy remains important. The unnecessary runtime machinery does not.

Likewise:

* prefer native redirects over redirect wrappers;
* prefer framework form handling over custom form infrastructure;
* prefer authentication-library session handling over local session abstractions;
* prefer database constraints over application-only consistency checks;
* prefer existing provider clients over pass-through client wrappers.

Remove machinery without removing the invariant it protected.

## Functions must own something

A function earns its existence when it owns meaningful knowledge.

Good:

```ts
verifyClearance(...)
rewritePlaylist(...)
parseBrowseFilters(...)
savePlaybackProgress(...)
rankSearchResults(...)
```

These names represent policies, boundaries, effects, or algorithms.

Usually unnecessary:

```ts
getPath(event)
isApiRequest(event)
sendUnauthorized()
callProvider(...)
handleResult(...)
```

when each contains only an obvious expression or forwards directly to another operation.

Do not extract a function solely because:

* the code is three lines long;
* the expression appears once;
* the parent function looks visually large;
* the helper can be unit tested;
* an analyzer reported complexity;
* the helper name sounds cleaner in isolation.

Extraction should make the **system** easier to understand, not merely make one function shorter.

## Prefer deep modules over many modules

A good module has a small surface and hides meaningful implementation knowledge.

A bad module has a small surface because it barely does anything.

Do not split one operation into several files merely so each file looks clean.

```text
episode-service.ts
episode-manager.ts
episode-helper.ts
episode-adapter.ts
episode-utils.ts
```

is worse than one cohesive `episodes.ts` when those files do not own independent concerns.

Split when each resulting module can independently answer:

> What knowledge does this module own that callers should not need to know?

If there is no strong answer, keep the code together.

## Keep related decisions together

Do not decompose a simple decision tree into tiny helpers that force the reader to jump between files.

A cohesive sequence such as:

```ts
if (exactMatch) {
  ...
}

if (titleMatch) {
  ...
}

if (aliasMatch) {
  ...
}

return fallback;
```

may be clearer than:

```ts
if (matchesExactly(...)) ...
if (matchesTitle(...)) ...
if (matchesAlias(...)) ...
```

when those helpers merely contain the conditions shown by their names.

Abstraction should hide complexity, not hide code.

## Keep effects at their boundary

External effects should remain visible where they are owned:

* redirects at route boundaries;
* database writes at persistence boundaries;
* cookies at request boundaries;
* media operations in the player owner;
* DOM subscriptions in component lifecycle;
* provider headers and retry policy in provider clients.

Do not send a simple effect through several generic functions unless those layers enforce real policy.

The reader should be able to locate consequential behavior without searching the entire repository.

## Prefer concrete code

Solve the problem that exists.

Do not introduce:

* generic factories for one implementation;
* interfaces with one implementation and no boundary reason;
* option objects for functions with two obvious arguments;
* plugin systems for fixed behavior;
* dependency injection merely to make tests convenient;
* configurable policies that the product does not currently configure;
* compatibility paths without existing compatibility requirements.

Generalize after the code has demonstrated what actually varies.

YAGNI applies to architecture as much as features.

## Repetition is cheaper than false abstraction

Duplicated syntax is not automatically duplicated knowledge.

These may remain separate:

```ts
return new Response("Unauthorized", { status: 401 });
```

and:

```ts
return new Response("Human verification required", { status: 403 });
```

even if a generic response helper could technically remove a few characters.

Combine behavior when callers share the same rule and must change together.

Do not combine behavior merely because the lines look similar today.

A small amount of local repetition is preferable to introducing a shared concept that has no independent meaning.

## Keep configuration near its owner

Do not create global constants, utility modules, or configuration objects merely to centralize values.

A value should move away from its operation only when several operations must agree on it or its name communicates meaningful policy.

Prefer:

```ts
redirect(303, "/login");
```

over:

```ts
const LOGIN_REDIRECT_STATUS = 303;
const LOGIN_ROUTE = "/login";

redirect(LOGIN_REDIRECT_STATUS, LOGIN_ROUTE);
```

The original call already explains itself.

Centralization is valuable only when consistency itself is part of the requirement.

## File layout

Within a file, prefer this order when applicable:

```text
imports
types or meaningful module policy
primary exported behavior
substantial private implementation
```

Do not begin a file with a wall of trivial constants and helpers that force the reader to reach the actual behavior later.

The primary operation should normally appear early.

Inside a function, organize code into visible phases:

```text
exceptional cases

validation / authorization

required state

main operation

result
```

Use blank lines to expose those phases.

Do not add comments such as:

```ts
// Check authentication
// Check permissions
// Return result
```

when the statements already make those phases obvious.

## Optimize for reading in place

Arc should reward reading rather than navigation.

When choosing between two equivalent designs, prefer the one that requires:

* fewer files opened;
* fewer symbols remembered;
* fewer aliases resolved;
* fewer callbacks traced;
* fewer configuration objects decoded;
* fewer generic types mentally substituted;
* fewer layers traversed;
* fewer exceptional cases remembered.

This does not mean putting everything in one file.

It means every boundary must pay for the navigation it introduces.

## Simplification must preserve correctness

Minimalism never means deleting complexity merely because it looks ugly.

Retain complexity that protects:

* security;
* authentication;
* authorization;
* persistence ordering;
* concurrency;
* lifecycle cleanup;
* caching semantics;
* protocol behavior;
* accessibility;
* provider compatibility;
* data validation;
* established product behavior.

The correct target is not the fewest lines.

The target is the fewest concepts required to express the complete behavior safely.

A short function protecting a race condition may be essential.

A large wrapper stack protecting nothing may be waste.

Judge each by the knowledge it owns.

## Refactoring order

When code feels over-engineered, simplify in this order:

1. Delete dead behavior.
2. Delete dead exports and files.
3. Inline aliases that add no distinction.
4. Inline trivial one-use helpers.
5. Remove pass-through wrappers and facades.
6. Flatten unnecessary control-flow nesting.
7. Move configuration to the layer that actually owns it.
8. Let project structure replace runtime classification where possible.
9. Consolidate only genuinely shared knowledge.
10. Extract only the substantial boundaries that remain.

Do not begin a cleanup by inventing a cleaner abstraction around unnecessary code.

First ask whether the code should exist at all.

## Review test

For every symbol introduced by a change, ask:

> What does this own?

For every abstraction, ask:

> What complexity disappears for its callers?

For every helper, ask:

> Would the caller be easier to understand if this code were simply written there?

For every layer, ask:

> What would become incorrect if this layer disappeared?

For every local variable, ask:

> Does this distinguish, snapshot, narrow, or explain something that the original expression does not?

For every file, ask:

> Does navigating here reveal a meaningful boundary, or did we only move code out of sight?

For every configuration mechanism, ask:

> Is application code actually the correct owner?

If the answer is weak, simplify.

## Desired result

Arc code should tend toward:

```text
few concepts
clear ownership
shallow call paths
guard clauses
direct framework usage
structural policy
local behavior
meaningful modules
explicit boundaries
minimal state
minimal ceremony
```

A good Arc implementation often looks almost obvious after it is finished.

That is the goal.

Not cleverness.

Not architectural symmetry.

Not the smallest diff.

Not the fewest characters.

**The simplest complete expression of the system's actual behavior.**
