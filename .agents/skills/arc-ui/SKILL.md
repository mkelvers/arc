---
name: arc-ui
description: Apply Arc's small-scope, behavior-preserving rules when implementing or refactoring Svelte UI, components, styles, interactions, accessibility, or responsive layouts.
---

# Arc UI

Use this skill for UI work in `apps/arc`, including Svelte components, component APIs, styling, interactions, accessibility, responsive behavior, loading states, menus, images, and carousels.

## Core rule

Implement the requested behavior with the smallest focused change. Preserve existing functionality, CSS, rendered geometry, accessibility behavior, and responsive behavior unless the user explicitly asks to change them.

Before editing, inspect the exact rendered component, its call sites, and the existing styles. Treat the user's named target as authoritative. Do not generalize from a nearby component or rewrite a working feature because a different design would be fashionable.

## Change boundaries

- Do not add a prop, callback, variant, abstraction, component, state model, dependency, fallback, or behavior that the prompt did not request.
- If the requested behavior appears to require one of those additions, stop before implementing it and ask the user whether they want that design. Explain the concrete trade-off in one or two sentences.
- Do not turn page-specific markup into a shared component merely because it looks reusable.
- Keep one-use values and mechanics at the owning call site.
- Use a shared module when it has meaningful reuse, a real invariant, an external effect, a public contract, or a substantial algorithm.

Read [references/prop-decisions.md](references/prop-decisions.md) when a change might expand a component interface.

## Composition

Prefer caller-owned markup and composition through children or snippets when callers need different structure or styling. Let a behavior module own state and interaction rules without also owning every visual detail.

Use variants for a small set of stable, repeated visual alternatives. Do not use a large collection of styling props to make one component impersonate unrelated components.

Read [references/composition.md](references/composition.md) when changing a component seam or considering compound components.

## Existing CSS and libraries

Keep existing classes unless the requested change includes visual changes. Move classes to the caller only when the new composition makes that ownership clearer, and verify that the rendered result is unchanged.

If an existing library can provide the requested interaction, inspect the current dependencies and the library's current documentation first. Do not install a dependency or replace working behavior without user agreement when that would change the public interface, bundle, accessibility behavior, or interaction model.

Read [references/css-preservation.md](references/css-preservation.md) for visual-preservation decisions and [references/library-decisions.md](references/library-decisions.md) before proposing a UI dependency.

## Verification

After each focused change:

1. Run the narrowest relevant type check, test, or build.
2. Inspect the diff for unrelated churn and accidental API expansion.
3. Verify the requested interaction and the unaffected desktop/mobile states.
4. Run the repository checks before handoff when the change is complete.
