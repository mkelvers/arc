<script lang="ts">
    import type { Snippet } from 'svelte';
    import { tick } from 'svelte';
    import { m } from '$lib/i18n.svelte';
    import Button from './button/button.svelte';

    type TriggerProps = {
        id: string;
        type: 'button';
        'aria-haspopup': 'menu' | 'dialog';
        'aria-expanded': boolean;
        'aria-controls': string;
        'data-state': 'open' | 'closed';
        'data-dropdown-trigger': '';
        'data-testid': 'dropdown-trigger';
        disabled: boolean;
        onclick: (event: MouseEvent) => void;
    };

    type MenuProps = {
        id: string;
        tabindex: -1;
        'data-dropdown-menu': '';
        'aria-modal'?: 'true';
        onclick: (event: MouseEvent) => void;
        onkeydown: (event: KeyboardEvent) => void;
    };

    interface Props {
        id: string;
        trigger: Snippet<[TriggerProps]>;
        content: Snippet<[MenuProps]>;
        modal?: boolean;
        disabled?: boolean;
        closeOnSelection?: boolean;
    }

    let { id, trigger, content, modal = false, disabled = false, closeOnSelection = true }: Props = $props();
    let open = $state(false);
    let root = $state<HTMLDivElement>();

    function focusableMenuElements() {
        return Array.from(
            root
                ?.querySelector<HTMLElement>('[data-dropdown-menu]')
                ?.querySelectorAll<HTMLElement>(
                    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
                ) ?? []
        );
    }

    function close() {
        if (!open) {
            return;
        }

        open = false;
        void tick().then(() => {
            root?.querySelector<HTMLElement>('[data-dropdown-trigger]')?.focus();
        });
    }

    function toggle(event: MouseEvent) {
        if (disabled) {
            return;
        }

        if (open) {
            close();
            return;
        }

        open = true;
        if (event.detail === 0) {
            void tick().then(() => focusableMenuElements()[0]?.focus());
        }
    }

    function closeOnContentSelection(event: MouseEvent) {
        const target = event.target;
        if (!(target instanceof Element) || (!closeOnSelection && !target.closest('[data-dropdown-close]'))) {
            return;
        }

        if (target.closest('a, button')) {
            close();
        }
    }

    function handleMenuKeydown(event: KeyboardEvent) {
        const elements = focusableMenuElements();
        const currentIndex = event.target instanceof HTMLElement ? elements.indexOf(event.target) : -1;

        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }

        if (modal && event.key === 'Tab') {
            if (!elements.length) {
                event.preventDefault();
                root?.querySelector<HTMLElement>('[data-dropdown-menu]')?.focus();
                return;
            }

            const nextIndex = event.shiftKey
                ? currentIndex <= 0
                    ? elements.length - 1
                    : currentIndex - 1
                : currentIndex === elements.length - 1
                  ? 0
                  : currentIndex + 1;
            event.preventDefault();
            elements[nextIndex]?.focus();
            return;
        }
    }

    $effect(() => {
        if (!open) {
            return;
        }

        void tick().then(() => {
            root?.querySelector<HTMLElement>('[data-dropdown-menu] [aria-current="page"]')?.scrollIntoView({
                block: 'nearest',
            });
        });
    });

    function closeOnWindowEvent(event: PointerEvent | KeyboardEvent) {
        if (!open) {
            return;
        }

        const shouldClose =
            event instanceof KeyboardEvent
                ? event.key === 'Escape'
                : event.target instanceof Node && root !== undefined && !root.contains(event.target);

        if (shouldClose) {
            close();
        }
    }
</script>

<svelte:window onpointerdown={closeOnWindowEvent} onkeydown={closeOnWindowEvent} />
<svelte:body class:overflow-hidden={open && modal} />

<div bind:this={root} class="dropdown relative" role="group">
    {@render trigger({
        id,
        type: 'button',
        'aria-haspopup': modal ? 'dialog' : 'menu',
        'aria-expanded': open,
        'aria-controls': `${id}-menu`,
        'data-state': open ? 'open' : 'closed',
        'data-dropdown-trigger': '',
        'data-testid': 'dropdown-trigger',
        disabled,
        onclick: toggle,
    })}

    {#if open && modal}
        <Button
            variant="unstyled"
            type="button"
            class="fixed inset-x-0 top-14 z-40 h-[calc(100dvh-3.5rem)] cursor-default bg-black/65 backdrop-blur-[2px]"
            aria-label={m.shared_close_menu()}
            onclick={close}
        ></Button>
    {/if}

    {#if open}
        {@render content({
            id: `${id}-menu`,
            tabindex: -1,
            'data-dropdown-menu': '',
            'aria-modal': modal ? 'true' : undefined,
            onclick: closeOnContentSelection,
            onkeydown: handleMenuKeydown,
        })}
    {/if}
</div>
