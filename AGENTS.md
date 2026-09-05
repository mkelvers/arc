# Arc code policy

## Prefer local, readable code

Write code so a reader can skim the owning operation and understand it without jumping through a chain of tiny modules or helpers. Keep simple logic at the call site. Do not create a function, variable, or constant merely to give a name to an obvious expression or to move one line somewhere else.

In particular, inline one-use values such as a resolution deadline, resolution concurrency, text batch limit, request lifetime, failed-request lifetime, provider cooldown duration, or a one-use set of failed sources. Inline one-use helpers such as supported-host checks, transport-error predicates, no-match predicates, and pass-through wrappers when their body is already clear at the call site. A name is not automatically an improvement: the indirection cost is real when it forces a reader to leave the current operation.

Keep a helper or module when it earns its boundary. Valid reasons include:

- reusable behavior with more than one meaningful caller;
- a domain rule, invariant, security check, or persistence contract whose name communicates something non-obvious;
- an external effect, lifecycle, retry policy, or stateful coordination that benefits from a deliberate seam;
- a substantial algorithm whose local name makes the surrounding operation easier to follow;
- a public API, framework entry point, schema declaration, generated file, or test fixture boundary.

Do not use a broad “constants” or “utils” module as a dumping ground. Keep configuration and simple literals beside the operation that owns them unless they are genuinely reused, externally configurable, or protect a non-obvious protocol, security, persistence, or timing rule. Module-scope mutable state is not exempt: keep it only when the process-wide lifecycle is intentional, and make that lifecycle visible in the owning module.

Before extracting or retaining an abstraction, apply the deletion test: if deleting it and placing its body at its only call site makes the code clearer without losing a real contract, delete it. Prefer direct APIs and cohesive modules over one-file-per-helper decomposition. Do not perform cosmetic renames or blanket analyzer-driven deletions; inspect callers, side effects, error behavior, and tests first.

## Long-term code quality

Implement the actual fix, not the smallest patch that makes the symptom disappear. Prefer simple, direct code with clear ownership and a small interface. Before adding an abstraction, indirection, fallback, cache, compatibility path, or configuration, establish that it solves a real repeated problem or protects a real invariant. Keep code local when locality makes behavior easier to understand; split it only when the seam has a clear owner, meaningful reuse, or an independent lifecycle.

When a change reveals related design debt in scope, resolve it while the context is fresh instead of leaving a known fragile path for later. Preserve behavior and data intentionally, but do not preserve unnecessary complexity. Spend the extra time to choose a durable solution, trace callers and side effects, and verify the real behavior with focused tests and repository checks. Optimize for a codebase that remains understandable and easy to extend years from now, not merely for today’s green check.

## Generated and framework code

Do not hand-edit generated output, database migrations, or framework-generated files as part of this cleanup. Do not remove SvelteKit entry points or public exports solely because a static usage search sees one reference.

## Verification

Make one coherent cleanup at a time. Run the narrowest relevant test or type check immediately, then run the repository checks before handoff:

```bash
bun run format:check
bun run lint
bun run check
bun run test
```

The goal is fewer unnecessary indirections and better locality, not fewer lines at any cost. Preserve behavior, public compatibility, persisted data, and meaningful domain boundaries.
