# Library decisions

Use a library when it removes real interaction complexity and its contract fits the existing product. Do not add one only because a custom implementation is unpleasant to read.

## Evaluate before installing

```text
Do:
1. Identify the exact behavior to replace.
2. Check whether the repository already has a suitable dependency.
3. Read the library's current documentation and accessibility contract.
4. Compare its rendered structure, keyboard behavior, CSS ownership, and bundle cost.
5. Ask the user before adding it if the choice changes the component interface or interaction model.
```

```text
Do not:
1. Install a library because it has a familiar name.
2. Replace a working carousel or menu without recording its current behavior.
3. Add a wrapper around the library that recreates the same large prop surface.
4. Claim the library preserves CSS or accessibility without checking the rendered result.
```

If the library is not a clear improvement at the actual call sites, keep the focused local implementation and improve only the requested behavior.
