# CSS preservation

Behavior refactors must not become accidental visual refactors.

## Preserve the existing classes

```svelte
<!-- Do: keep the existing Tailwind classes on the element that owns the
     visual responsibility after composition. -->
<button class="flex h-10 items-center gap-2 text-muted hover:bg-surface">Sort</button>
```

```svelte
<!-- Do not: replace an exact existing class list with a new "cleaner"
     variant while the request is only about behavior or composition. -->
<Button variant="ghost" size="sm">Sort</Button>
```

A variant migration is a separate change unless the user explicitly requests it.

## Check geometry, not only compilation

```text
Do: compare the requested interaction and the unaffected desktop and mobile views.
Check trigger dimensions, menu position, overflow, focus rings, and stacking order.
```

```text
Do not: treat a green type check or build as proof that the UI stayed the same.
```
