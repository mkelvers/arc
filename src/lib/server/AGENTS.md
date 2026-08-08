# Server modules

Server code should expose operations, not call chains. Prefer ordinary `async` functions whose errors are normal typed `Error` subclasses. Do not wrap a Promise in an Effect, convert it back to a Promise at the caller, or add an adapter that takes the same arguments and returns the same result.

An integration adapter earns its existence by owning at least one concrete boundary concern: endpoint, authentication, headers, retry policy, timeout, response validation, provider identity, or translation into an application model. A facade that only groups imports into an object does not earn a file. Import the owning operation directly.

Validate external responses, persisted JSON, headers, form values, and URL values once at the boundary. Do not repeat validation after a value has become a trusted application model. Do not replace runtime validation with an interface: interfaces do not exist at runtime.

Keep caches and request coalescing with the operation whose freshness policy they implement. Avoid `cachedX` and `getX` layers when one public function can own key normalization, cache lookup, and loading clearly. Retain separate request and mapping stages when each is substantial and the split makes provider transformation testable.

Provider absence, optional enrichment failure, and fatal transport failure are different outcomes. Preserve those distinctions while removing wrappers; do not turn cleanup into silent fallback behavior.
