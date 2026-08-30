<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';
    import { m } from '$lib/i18n.svelte';

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
        modal?: boolean;
        openOnHover?: boolean;
        disabled?: boolean;
        triggerClass?: string;
        contentClass?: string;
        rootClass?: string;
    }

    let {
        id,
        trigger,
        items = [],
        content,
        ariaLabel = m.anime_more(),
        menuAlign = 'end',
        menuClass = 'w-48',
        modal = false,
        openOnHover = false,
        disabled = false,
        triggerClass = 'block min-h-11 cursor-pointer px-3 transition-colors hover:bg-panel data-[state=open]:bg-panel',
        contentClass = 'bg-panel',
        rootClass = '',
    }: Props = $props();
    let open = $state(false);
    let root = $state<HTMLDivElement>();
    let menu = $state<HTMLDivElement>();
    let triggerElement = $state<HTMLButtonElement>();

    function closeOnSelection(event: MouseEvent) {
        if (event.target instanceof Element && event.target.closest('a, button')) {
            open = false;
        }
    }

    $effect(() => {
        if (!open || !menu) {
            return;
        }

        requestAnimationFrame(() => {
            menu?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({
                block: 'nearest',
            });
        });
    });

    $effect(() => {
        if (!open || !modal) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    });

    $effect(() => {
        const element = root;
        if (!element) {
            return;
        }

        const close = (event: PointerEvent) => {
            if (event.target instanceof Node && !element.contains(event.target)) {
                open = false;
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                open = false;
                triggerElement?.focus();
            }
        };

        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', closeOnEscape);

        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', closeOnEscape);
        };
    });
</script>

<div
    bind:this={root}
    class={cn('dropdown relative', rootClass)}
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
    <button
        bind:this={triggerElement}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        data-state={open ? 'open' : 'closed'}
        data-testid="dropdown-trigger"
        class={cn('appearance-none border-0 bg-transparent p-0', triggerClass)}
        disabled={disabled}
        onclick={() => (open = !open)}
    >
        {@render trigger()}
    </button>

    {#if open && modal}
        <button
            type="button"
            class="fixed inset-x-0 top-14 z-40 h-[calc(100dvh-3.5rem)] cursor-default bg-black/65 backdrop-blur-[2px]"
            aria-label={m.shared_close_menu()}
            onclick={() => (open = false)}
        ></button>
    {/if}

    <div
        bind:this={menu}
        id={`${id}-menu`}
        class={cn(
            'absolute top-full z-50',
            menuAlign === 'start' ? 'left-0' : 'right-0',
            open ? 'block' : 'hidden',
            menuClass
        )}
    >
        <div
            role={content ? 'group' : 'menu'}
            aria-label={content ? ariaLabel : undefined}
            class={contentClass}
            onclick={closeOnSelection}
        >
            {#if content}
                {@render content()}
            {:else}
                {#each items as item}
                    <a
                        role="menuitem"
                        href={item.href}
                        aria-current={item.current ? 'page' : undefined}
                        class:text-foreground={item.current}
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
