<script lang="ts">
    import type { Snippet } from 'svelte';

    type Item = {
        label: string;
        href: string;
    };

    let { id, trigger, items }: { id: string; trigger: Snippet; items: Item[] } = $props();
    let open = $state(false);
</script>

<div class="dropdown relative" role="group" onmouseleave={() => open = false}>
    <input
        {id}
        type="checkbox"
        aria-label="More options"
        class="peer sr-only"
        bind:checked={open}
    />
    <label
        for={id}
        data-testid="dropdown-trigger"
        class="block min-h-11 cursor-pointer px-3 transition-colors hover:bg-panel peer-checked:bg-panel"
    >
        {@render trigger()}
    </label>

    <div
        role="menu"
        class="absolute top-full right-0 z-30 hidden w-48 bg-panel py-2 peer-checked:block"
    >
        {#each items as item}
            <a
                role="menuitem"
                href={item.href}
                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight font-normal text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
            >
                {item.label}
            </a>
        {/each}
    </div>
</div>
