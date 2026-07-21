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
        class="dropdown-trigger block min-h-11 cursor-pointer px-3 transition-colors"
    >
        {@render trigger()}
    </label>

    <div
        role="menu"
        class="dropdown-menu absolute top-full right-0 z-30 hidden w-[min(12rem,calc(100vw-2.5rem))] py-2 peer-checked:block"
    >
        {#each items as item}
            <a
                role="menuitem"
                href={item.href}
                class="dropdown-item block whitespace-nowrap px-5 py-3 text-sm leading-tight font-normal focus:outline-none"
            >
                {item.label}
            </a>
        {/each}
    </div>
</div>

<style>
    .dropdown-menu {
        background-color: rgb(39 39 39);
    }

    .dropdown-trigger:hover,
    .peer:checked + .dropdown-trigger {
        background-color: rgb(39 39 39);
    }

    .dropdown-item {
        color: var(--theme-muted);
    }

    .dropdown-item:hover,
    .dropdown-item:focus {
        background-color: rgb(16 16 16);
        color: var(--theme-foreground);
    }
</style>
