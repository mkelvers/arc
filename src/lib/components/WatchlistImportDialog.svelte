<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import {
        UploadSimpleIcon,
        WarningIcon,
        XIcon,
    } from 'phosphor-svelte';

    type Tone = 'error' | 'success';

    let {
        onresult,
    }: {
        onresult: (message: string, tone: Tone) => void;
    } = $props();

    let dialog = $state<HTMLDialogElement>();
    let fileInput = $state<HTMLInputElement>();
    let selectedFile = $state<File>();
    let pending = $state(false);
    let errorMessage = $state('');

    function message(data: unknown, fallback: string) {
        if (
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
        ) {
            return data.message;
        }

        return fallback;
    }

    function reset() {
        selectedFile = undefined;
        errorMessage = '';
        if (fileInput) {
            fileInput.value = '';
        }
    }

    function close() {
        if (pending) {
            return;
        }

        dialog?.close();
        reset();
    }

    function selectFile() {
        if (!pending) {
            fileInput?.click();
        }
    }

    function fileSelected(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        selectedFile = input.files?.[0];
        errorMessage = '';

        if (selectedFile) {
            dialog?.showModal();
        }
    }

    function backdropClick(event: MouseEvent) {
        if (event.target === dialog) {
            close();
        }
    }

    const submit: SubmitFunction = () => {
        pending = true;
        errorMessage = '';

        return async ({ result, update }) => {
            pending = false;

            if (result.type === 'success') {
                const resultMessage = message(
                    result.data,
                    'Your watchlist was imported.',
                );
                dialog?.close();
                reset();
                onresult(resultMessage, 'success');
                await update();
                return;
            }

            if (result.type === 'failure') {
                errorMessage = message(
                    result.data,
                    'Nothing was changed. The watchlist import failed.',
                );
                onresult(errorMessage, 'error');
                return;
            }

            await update({ reset: false });
        };
    };
</script>

<button
    type="button"
    class="grid size-9 place-items-center text-subtle transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
    aria-label="Import watchlist"
    title="Import watchlist"
    onclick={selectFile}
>
    <UploadSimpleIcon size="1.125rem" weight="regular" aria-hidden="true" />
</button>

<dialog
    bind:this={dialog}
    aria-labelledby="watchlist-import-title"
    aria-describedby="watchlist-import-description"
    class="m-auto w-[calc(100%-2rem)] max-w-md bg-panel p-0 text-white backdrop:bg-black/75"
    onclick={backdropClick}
    oncancel={(event) => {
        event.preventDefault();
        close();
    }}
>
    <form
        method="POST"
        action="?/import"
        enctype="multipart/form-data"
        use:enhance={submit}
        class="p-6 sm:p-7"
    >
        <input
            bind:this={fileInput}
            class="sr-only"
            name="watchlist"
            type="file"
            accept=".json,application/json"
            onchange={fileSelected}
            required
        />
        <input type="hidden" name="confirmReplace" value="replace" />

        <div class="flex items-start gap-4">
            <WarningIcon
                class="mt-0.5 shrink-0 text-status-error"
                size="1.75rem"
                weight="fill"
                aria-hidden="true"
            />
            <div class="min-w-0">
                <h2 id="watchlist-import-title" class="text-lg font-semibold">
                    Replace your watchlist?
                </h2>
                <p
                    id="watchlist-import-description"
                    class="mt-2 text-sm leading-6 text-watch-secondary"
                >
                    This will permanently replace every anime in your current
                    watchlist with compatible AniList entries from
                    <strong class="font-semibold text-white">
                        {selectedFile?.name ?? 'the selected file'}
                    </strong>.
                    Entries unavailable on AniList will be skipped. This action
                    cannot be undone.
                </p>
            </div>
            <button
                type="button"
                class="-mt-2 -mr-2 ml-auto grid size-10 shrink-0 place-items-center text-watch-secondary transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
                aria-label="Decline import"
                onclick={close}
                disabled={pending}
            >
                <XIcon size="1.25rem" weight="bold" aria-hidden="true" />
            </button>
        </div>

        {#if errorMessage}
            <p class="mt-5 text-sm font-medium text-status-error" role="alert">
                {errorMessage}
            </p>
        {/if}

        <div class="mt-7 flex justify-end gap-3">
            <button
                type="button"
                class="h-10 px-4 text-sm font-semibold text-watch-secondary transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
                onclick={close}
                disabled={pending}
            >
                Decline
            </button>
            <button
                type="submit"
                class="h-10 bg-status-error px-4 text-sm font-bold text-on-status transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-status-error disabled:cursor-wait disabled:opacity-60"
                disabled={pending || !selectedFile}
            >
                {pending ? 'Importing…' : 'Accept and replace'}
            </button>
        </div>
    </form>
</dialog>
