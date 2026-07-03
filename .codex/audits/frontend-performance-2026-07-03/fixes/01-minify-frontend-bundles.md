# Fix 01: minify frontend bundles

Priority: P0  
Risk: Low  
Primary benefit: First-load transfer and JavaScript parse cost

## Issue

The production build currently invokes `bun build` without minification in [`scripts/build-ts.ts`](../../../../scripts/build-ts.ts). The audit measured:

| Bundle | Current raw size | Current gzip estimate | Diagnostic minified raw | Diagnostic minified gzip |
|---|---:|---:|---:|---:|
| Global application bundle | 61KB | 13KB | 32KB | 9KB |
| Player bundle | 1.16MB | 241KB | 556KB | 175KB |

The player bundle is isolated to the watch page, which is good, but its current raw size matters because the server does not yet compress responses. Even after HTTP compression is added, minification still reduces transferred bytes and parsing work.

## Desired behavior

- Production builds emit minified browser bundles.
- Development watch builds remain readable unless explicitly configured otherwise.
- A failed build still exits non-zero.
- Optional source maps can be generated without publishing source content unintentionally.
- Bundle-size changes are visible in CI or `just check` output.

## Proposed implementation

Add `--minify` to both production `bun build` invocations in `scripts/build-ts.ts`.

Keep `--target browser`. The current code runs in browsers and must not be built for Bun or Node.

Keep the player and general app as separate entry points. Do not merge them: loading HLS/player code on login, browse, and search would undo the main architectural benefit of the current split.

Use one of these source-map policies:

1. `none`: smallest and safest default if production stack traces are not collected.
2. `external`: emit map files without linking them from the JavaScript; upload them only to an error-reporting service.
3. `linked`: emit map files and add source-map references. Use only if serving maps publicly is acceptable.

For this self-hosted application, `none` is the minimal default. Add external maps later only when there is a consumer for them.

## Implementation steps

1. Add `--minify` to the `player` and `app` argument lists.
2. Build into a clean `dist/` directory to avoid retaining obsolete chunks.
3. Print raw output sizes after the build. Treat this as visibility first, not a hard failure.
4. Add a documented bundle budget after a baseline has been stable for a few releases.
5. Run the existing TypeScript typecheck and browser-flow tests before comparing output.

Suggested initial budgets:

- `dist/static/app.js`: at most 45KB raw.
- `dist/static/player/main.js`: at most 650KB raw.
- Any future shared chunk: at most 250KB raw unless intentionally documented.

## Code splitting

The player build already passes `--splitting`, but a single static entry point will not necessarily create useful chunks. Do not split merely to create more files. A chunk is worthwhile when it avoids loading a feature in a common path.

The strongest future candidate is a dynamic import of HLS.js only when the chosen source is HLS. Before doing that, measure how often the provider returns HLS versus direct media. If nearly all playback uses HLS, dynamic import adds another request without avoiding much code.

## Affected files

- `scripts/build-ts.ts`
- `justfile`, only if separate development and production build recipes become necessary
- Optional new bundle-size check under `scripts/`

## Tests

- Production build emits both expected entry points.
- Bundle smoke test imports/executes each generated module without a syntax error.
- Existing player browser-flow tests pass against the minified build.
- A bundle-size script fails clearly when an expected output is missing.
- If source maps are enabled, the selected map files are generated and excluded from ordinary static serving unless intentionally public.

## Verification

Run:

```sh
just build-ts
just typecheck
bun test
ls -lh dist/static/app.js dist/static/player/main.js
```

Then verify in the browser:

- Home, browse, search, and watch pages initialize normally.
- Player controls, subtitles, quality selection, episode navigation, and progress saving still work.
- There are no syntax errors in the browser console.

## Observability

Print raw and gzip-estimated bundle sizes in CI/release output. Track size changes over time; do not rely on a one-time before/after comparison. Runtime error reporting should include the deployed asset version so a minified stack trace can be matched to the correct build.

## Rollout

This can ship independently. Compare the generated asset sizes in the release artifact. If stack traces become too difficult to interpret, add external source maps rather than reverting minification.

## Acceptance criteria

- Both application bundles are minified in the production build.
- Player raw size is below 650KB with the current dependency set.
- Global app raw size is below 45KB.
- Existing frontend tests pass.
- No player feature regression is visible in the browser flow.

## Reference

- [Bun bundler options](https://github.com/oven-sh/bun/blob/main/docs/bundler/index.mdx)
