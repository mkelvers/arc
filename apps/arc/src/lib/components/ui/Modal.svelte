<script lang="ts">
    import type { Snippet } from 'svelte';
    import { XIcon } from 'phosphor-svelte';

    import { cn } from '$lib/utils';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        children?: Snippet;
        description?: string;
        id?: string;
        onclose?: () => void;
        open?: boolean;
        title: string;
        wide?: boolean;
    }

    let { children, description, id = 'modal', onclose, open = false, title, wide = false }: Props = $props();
    let dialog = $state<HTMLDialogElement>();

    $effect(() => {
        if (!dialog) {
            return;
        }

        if (open && !dialog.open) {
            dialog.showModal();
            dialog.focus({ preventScroll: true });
        } else if (!open && dialog.open) {
            dialog.close();
        }
    });

    function close() {
        if (dialog?.open) {
            dialog.close();
        }

        onclose?.();
    }
</script>

<dialog
    bind:this={dialog}
    aria-labelledby={`${id}-title`}
    aria-describedby={description ? `${id}-description` : undefined}
    tabindex="-1"
    class={cn(
        wide ? 'h-11/12 w-11/12 max-w-5xl' : 'w-[calc(100%-2rem)] max-w-lg',
        'm-auto hidden max-h-[calc(100dvh-2rem)] flex-col overflow-hidden bg-panel p-0 text-foreground shadow-2xl outline-none open:flex backdrop:bg-black/75'
    )}
    onclick={(event) => {
        if (event.target === dialog) {
            close();
        }
    }}
    oncancel={(event) => {
        event.preventDefault();
        close();
    }}
>
    <header class="flex min-h-20 shrink-0 items-center border-b border-black/15 bg-panel-strong px-5 sm:px-8">
        <div class="min-w-0">
            <h2 id={`${id}-title`} class="line-clamp-2 text-lg font-bold sm:text-xl">{title}</h2>
            {#if description}
                <p id={`${id}-description`} class="mt-1 text-sm text-muted">{description}</p>
            {/if}
        </div>
        <button
            type="button"
            class="ml-auto grid size-11 shrink-0 place-items-center transition-[background-color,transform] duration-150 hover:bg-white/8 focus-visible:outline-1 focus-visible:outline-white active:scale-95"
            aria-label={m.shared_close_menu()}
            onclick={close}
        >
            <XIcon size="1.75rem" weight="bold" aria-hidden="true" />
        </button>
    </header>

    {@render children?.()}
</dialog>

<style>
    dialog {
        opacity: 0;
        transform: scale(0.96);

        transition:
            opacity 150ms cubic-bezier(0.23, 1, 0.32, 1),
            transform 150ms cubic-bezier(0.23, 1, 0.32, 1),
            overlay 150ms allow-discrete,
            display 150ms allow-discrete;
    }

    dialog[open] {
        opacity: 1;
        transform: scale(1);

        transition:
            opacity 250ms cubic-bezier(0.23, 1, 0.32, 1),
            transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
            overlay 250ms allow-discrete,
            display 250ms allow-discrete;

        @starting-style {
            opacity: 0;
            transform: scale(0.96);
        }
    }

    dialog::backdrop {
        opacity: 0;
        transition:
            opacity 150ms ease-out,
            overlay 150ms allow-discrete,
            display 150ms allow-discrete;
    }

    dialog[open]::backdrop {
        opacity: 1;
        transition:
            opacity 250ms ease-out,
            overlay 250ms allow-discrete,
            display 250ms allow-discrete;

        @starting-style {
            opacity: 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        dialog,
        dialog[open] {
            transform: none;
            transition:
                opacity 120ms ease-out,
                overlay 120ms allow-discrete,
                display 120ms allow-discrete;
        }

        dialog[open] {
            @starting-style {
                transform: none;
            }
        }
    }
</style>
