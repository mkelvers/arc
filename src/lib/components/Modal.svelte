<script lang="ts">
    import type { Snippet } from 'svelte';
    import { XIcon } from 'phosphor-svelte';

    interface Props {
        children?: Snippet;
        description?: string;
        id?: string;
        onclose?: () => void;
        open?: boolean;
        title: string;
        wide?: boolean;
    }

    let {
        children,
        description,
        id = 'modal',
        onclose,
        open = $bindable(false),
        title,
        wide = false,
    }: Props = $props();
    let dialog = $state<HTMLDialogElement>();

    $effect(() => {
        if (!dialog) {
            return;
        }

        if (open && !dialog.open) {
            dialog.showModal();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    });

    function close() {
        open = false;
    }

    function closed() {
        open = false;
        onclose?.();
    }
</script>

<dialog
    bind:this={dialog}
    aria-labelledby={`${id}-title`}
    aria-describedby={description ? `${id}-description` : undefined}
    class={`${wide ? 'h-11/12 w-11/12 max-w-5xl' : 'w-[calc(100%-2rem)] max-w-md'} m-auto max-h-screen overflow-hidden bg-panel p-0 text-foreground backdrop:bg-black/75`}
    onclick={(event) => {
        if (event.target === dialog) {
            close();
        }
    }}
    oncancel={(event) => {
        event.preventDefault();
        close();
    }}
    onclose={closed}
>
    <header
        class="flex min-h-20 items-center border-b border-black/15 bg-panel-strong px-5 sm:px-8"
    >
        <div class="min-w-0">
            <h2 id={`${id}-title`} class="line-clamp-2 text-lg font-bold sm:text-xl">{title}</h2>
            {#if description}
                <p id={`${id}-description`} class="mt-1 text-sm text-muted">{description}</p>
            {/if}
        </div>
        <button
            type="button"
            class="ml-auto grid size-11 shrink-0 place-items-center hover:bg-white/8 focus-visible:outline-1 focus-visible:outline-white"
            aria-label={`Close ${title}`}
            onclick={close}
        >
            <XIcon size="1.75rem" weight="bold" aria-hidden="true" />
        </button>
    </header>

    {@render children?.()}
</dialog>
