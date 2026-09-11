# Arc repository guidance

Keep code readable at the owning call site. Do not extract one-use values or helpers unless the name communicates a real rule, invariant, lifecycle, public contract, or substantial algorithm. Prefer a small interface with behavior behind it, and apply the deletion test before keeping an abstraction.

Preserve unrelated work, public behavior, persisted data, generated files, and framework entry points. Inspect callers, side effects, error behavior, and tests before deleting or moving code.

For UI work in `apps/arc`, use the repository-local `arc-ui` skill at `.agents/skills/arc-ui/SKILL.md`. It defines the stricter scope and approval rules for UI changes.

Before handoff, run the narrowest relevant check, then the repository checks:

```bash
bun run format:check
bun run lint
bun run check
bun run test
```

Do not hand-edit generated output or database migrations. Do not commit unless the user asks for a commit.
