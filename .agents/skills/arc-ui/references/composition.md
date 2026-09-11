# Composition decisions

The caller should own content that varies in structure. The shared module should own the smallest interaction contract that is genuinely repeated.

## Behavior with caller-owned markup

```svelte
<!-- Do: the caller controls the trigger's markup and classes. The behavior
     module supplies only the state and action needed by the trigger. -->
<Dropdown>
    {#snippet trigger({ open, toggle })}
        <button
            class="site-specific-trigger"
            data-state={open ? 'open' : 'closed'}
            onclick={toggle}
        >
            Categories
        </button>
    {/snippet}
    {#snippet content()}
        <NavigationLinks />
    {/snippet}
</Dropdown>
```

```svelte
<!-- Do not: make Dropdown render a hidden internal button and then expose
     several class props so every caller can repair its appearance. -->
<Dropdown triggerClass="site-specific-trigger" contentClass="site-specific-menu">
    {#snippet trigger()}
        Categories
    {/snippet}
</Dropdown>
```

The exact interface is a design decision. Do not implement this sketch literally without checking every existing caller and preserving its behavior.

## One-use markup

```svelte
<!-- Do: keep a tiny page-specific option local when it has one owner. -->
<a href={href} class="..." aria-current={selected ? 'page' : undefined}>
    {label}
</a>
```

```svelte
<!-- Do not: create a generic MenuOption component solely to hide the markup
     when other menus still use handwritten links and buttons. -->
<MenuOption href={href} label={label} selected={selected} />
```

Use a shared menu item only when it owns a meaningful repeated contract, such as keyboard behavior or a stable selection model.
