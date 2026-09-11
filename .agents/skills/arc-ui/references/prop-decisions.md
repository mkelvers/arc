# Prop decisions

A prop is part of a module's interface. Add one only when the variation is real, repeated, and belongs to the module's responsibility.

## Requested variation with a real owner

```svelte
<!-- Do: the component owns this repeated behavior and the caller needs it. -->
<Dropdown closeOnSelection={false}>
    {#snippet content()}
        <NavigationPanel />
    {/snippet}
</Dropdown>
```

```svelte
<!-- Do not: add a prop just to move one page-specific click handler into a shared API. -->
<Dropdown onItemSelected={handleThisOnePageOnly}>
    {#snippet content()}
        <OneOffAction />
    {/snippet}
</Dropdown>
```

Keep the one-off behavior beside the action unless at least two meaningful callers need the same contract.

## A visual difference

```svelte
<!-- Do: let the caller own materially different markup or styling. -->
<Dropdown>
    {#snippet trigger()}
        <Button variant="ghost">Account</Button>
    {/snippet}
</Dropdown>
```

```svelte
<!-- Do not: grow a shared component with triggerClass, menuClass, rootClass,
     contentClass, and more until it becomes a styling pass-through. -->
<Dropdown triggerClass="..." menuClass="..." rootClass="..." contentClass="..." />
```

If the shared module must expose many class props to remain useful, reconsider the seam before adding another prop.

## Ambiguous implementation choice

```text
User request: "Add a close button to this menu."

Do: implement the close button locally if the request only names this menu.
Ask first: "Should this be local to this menu, or do you want a reusable close-button API on Dropdown?"
```

```text
Do not: silently add a new Dropdown prop, callback, or context API because it seems more reusable.
```
