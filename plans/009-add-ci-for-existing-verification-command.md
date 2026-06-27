---
finding: "Add CI for the existing verification command"
catalog: "DX / Tooling"
impact:
  "Local checks are well-defined, but nothing checked in runs them consistently before changes land."
base_commit: "0d31d46"
---

## Effort

S - add one workflow mirroring documented local commands.

## Risk

LOW - CI should run existing verification rather than introduce new policy.

## Confidence

HIGH - no GitHub Actions workflow was present, while local verification is documented.

## Evidence

- `justfile:40` defines `check` as the full local verification command.
- `package.json:11-18` exposes lint, test, and typecheck scripts.
- `README.md:130-138` documents `just check` as linting, tests, typechecking, and full build.
- No `.github/workflows/*` files were found during recon.

## Resolution Approach

Add a GitHub Actions workflow that installs the pinned toolchain from `.mise.toml`, installs Bun
dependencies with the lockfile, and runs `just check`. The workflow should mirror documented local
behavior as closely as possible.

This plan depends on fixing the current Go lint baseline first. Do not add CI while `just check` is
known to fail locally, unless the workflow is intentionally introduced as failing and the maintainer
explicitly wants that.

Use caching only if the first version is too slow. Start simple: checkout, setup mise or equivalent,
`mise install`, `bun install --frozen-lockfile`, `just check`. Ensure CGO/SQLite prerequisites are
available on the runner.

Verify locally with `just check` after plan 001 is complete. Verify workflow syntax using GitHub’s
normal workflow validation when pushed.
