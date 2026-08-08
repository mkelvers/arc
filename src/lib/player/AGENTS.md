# Player domain

Player code contains real state-machine, timing, caption, and media-protocol complexity. Reduce navigation and adapters, but do not flatten correctness-critical algorithms into UI components.

- Keep `playback.svelte.ts` as the lifecycle owner. Do not add wrappers that repeat a method's arguments or return another media helper unchanged.
- Keep helpers such as subtitle-track matching when several playback decisions use the same rule. Delete singular/plural aliases or compatibility wrappers that expose the same operation twice.
- Localize a threshold used by one scoring or scheduling function. Keep a module constant only when multiple related algorithms share it or when it names an external protocol/security rule.
- Do not export a helper solely so its test can import it. Prefer testing through the public operation unless the helper is itself a substantial deterministic algorithm.
- Use `$derived` for values and event handlers for actions. Use `$effect` only to synchronize with media, timers, observers, storage, navigation, or another external lifecycle.

Timing and caption constants are behavior, not decoration. Before deleting or inlining one, inspect every algorithm and regression test that depends on it. A small shared tolerance can carry more correctness than its line count suggests.
