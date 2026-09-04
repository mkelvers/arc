# Contributing to Arc

## Daily workflow

Start from the protected `main` branch and create one short-lived branch for the issue you are solving:

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

Keep commits small and focused. Use a conventional commit message such as `fix: preserve playback resume`.

Before opening a pull request, run the checks relevant to the change:

```bash
bun run format:check
bun run lint
bun run check
bun run test
```

Push the branch, open a pull request into `main`, describe the change and validation, resolve every conversation, and squash-merge when the diff is ready. Delete the branch after merging.

Issues describe work. Pull requests implement one issue. Do not push directly to `main`.
