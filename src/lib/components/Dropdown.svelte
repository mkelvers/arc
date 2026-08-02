<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    type Item = {
        label: string;
        href: string;
        current?: boolean;
    };

    interface Props {
        id: string;
        trigger: Snippet;
        items?: Item[];
        content?: Snippet;
        ariaLabel?: string;
        menuAlign?: 'start' | 'end';
        menuClass?: string;
        openOnHover?: boolean;
        triggerClass?: string;
    }

    let {
        id,
        trigger,
        items = [],
        content,
        ariaLabel = 'More options',
        menuAlign = 'end',
        menuClass = 'w-48',
        openOnHover = false,
        triggerClass = 'block min-h-11 cursor-pointer px-3 transition-colors hover:bg-panel peer-checked:bg-panel',
    }: Props = $props();
    let open = $state(false);
    let root = $state<HTMLDivElement>();
    let menu = $state<HTMLDivElement>();

    $effect(() => {
        if (!open || !menu) {
            return;
        }

        requestAnimationFrame(() => {
            menu
                ?.querySelector<HTMLElement>('[aria-current="page"]')
                ?.scrollIntoView({ block: 'nearest' });
        });
    });

    $effect(() => {
        const element = root;
        if (!element) {
            return;
        }

        const close = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !element.contains(event.target)
            ) {
                open = false;
            }
        };
        document.addEventListener('pointerdown', close);

        return () => document.removeEventListener('pointerdown', close);
    });
</script>

<div
    bind:this={root}
    class="dropdown relative"
    role="group"
    onmouseenter={() => {
        if (openOnHover) {
            open = true;
        }
    }}
    onmouseleave={() => {
        if (openOnHover) {
            open = false;
        }
    }}
>
    <input
        {id}
        type="checkbox"
        aria-label={ariaLabel}
        class="peer sr-only"
        bind:checked={open}
    />
    <label
        for={id}
        data-testid="dropdown-trigger"
        class={triggerClass}
    >
        {@render trigger()}
    </label>

    <div
        bind:this={menu}
        class={cn(
            'absolute top-full z-50 hidden peer-checked:block',
            menuAlign === 'start' ? 'left-0' : 'right-0',
            menuClass,
        )}
    >
        <div
            role={content ? 'group' : 'menu'}
            aria-label={content ? ariaLabel : undefined}
            class="bg-panel"
            onclick={() => (open = false)}
        >
            {#if content}
                {@render content()}
            {:else}
                {#each items as item}
                    <a
                        role="menuitem"
                        href={item.href}
                        aria-current={item.current ? 'page' : undefined}
                        class:text-accent={item.current}
                        class:text-muted={!item.current}
                        class="block whitespace-nowrap px-5 py-3 text-sm leading-tight font-normal hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                    >
                        {item.label}
                    </a>
                {/each}
            {/if}
        </div>
    </div>
</div>
