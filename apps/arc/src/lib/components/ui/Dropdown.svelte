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

    function menuElement() {
        return root?.querySelector<HTMLElement>('[data-dropdown-menu]');
    }

    function focusableMenuElements() {
        return Array.from(
            menuElement()?.querySelectorAll<HTMLElement>(
                'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
            ) ?? []
        );
    }

    async function focusFirstMenuItem() {
        await tick();
        focusableMenuElements()[0]?.focus();
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
            void focusFirstMenuItem();
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
                menuElement()?.focus();
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

        if (!elements.length) {
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const nextIndex =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? elements.length - 1
                      : event.key === 'ArrowDown'
                        ? (currentIndex + 1) % elements.length
                        : (currentIndex - 1 + elements.length) % elements.length;
            elements[nextIndex]?.focus();
        }
    }

    $effect(() => {
        if (!open) {
            return;
        }

        void tick().then(() => {
            menuElement()?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({
                block: 'nearest',
            });
        });
    });

    function handleOutsidePointer(event: PointerEvent) {
        if (open && event.target instanceof Node && root && !root.contains(event.target)) {
            close();
        }
    }

    function closeOnWindowEscape(event: KeyboardEvent) {
        if (open && event.key === 'Escape') {
            close();
        }
    }
</script>

<svelte:window onpointerdown={handleOutsidePointer} onkeydown={closeOnWindowEscape} />
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
