<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { UploadSimpleIcon, WarningIcon } from 'phosphor-svelte';

    import DataSpinner from '$lib/components/DataSpinner.svelte';
    import Modal from '$lib/components/Modal.svelte';
    import Tooltip from '$lib/components/Tooltip.svelte';

    type Tone = 'error' | 'success';

    let {
        onresult,
    }: {
        onresult: (message: string, tone: Tone) => void;
    } = $props();

    let fileInput = $state<HTMLInputElement>();
    let selectedFile = $state<File>();
    let open = $state(false);
    let mode = $state<'merge' | 'replace'>('merge');
    let pending = $state(false);
    let errorMessage = $state('');

    function resultMessage(data: unknown, fallback: string) {
        return typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
            ? data.message
            : fallback;
    }

    function reset() {
        selectedFile = undefined;
        mode = 'merge';
        errorMessage = '';
        if (fileInput) {
            fileInput.value = '';
        }
    }

    function close() {
        if (pending) {
            return;
        }

        open = false;
        reset();
    }

    function fileSelected(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        selectedFile = input.files?.[0];
        errorMessage = '';
        if (selectedFile) {
            open = true;
        }
    }

    const submit: SubmitFunction = () => {
        pending = true;
        errorMessage = '';

        return async ({ result, update }) => {
            pending = false;

            if (result.type === 'success') {
                const message = resultMessage(result.data, 'Your watchlist was imported.');
                open = false;
                reset();
                onresult(message, 'success');
                await update();
                return;
            }

            if (result.type === 'failure') {
                errorMessage = resultMessage(
                    result.data,
                    'Nothing was changed. The watchlist import failed.'
                );
                onresult(errorMessage, 'error');
                return;
            }

            await update({ reset: false });
        };
    };
</script>

<Tooltip text="Import watchlist">
    <label
        class="grid size-10 cursor-pointer place-items-center text-muted transition-colors hover:bg-surface hover:text-foreground focus-within:outline-1 focus-within:outline-offset-1 focus-within:outline-accent"
    >
        <input
            bind:this={fileInput}
            class="sr-only"
            form="watchlist-import-form"
            name="watchlist"
            type="file"
            accept=".json,application/json"
            aria-label="Import watchlist"
            onchange={fileSelected}
        />
        <UploadSimpleIcon size="1.2rem" weight="regular" aria-hidden="true" />
    </label>
</Tooltip>

<Modal
    id="watchlist-import"
    bind:open={open}
    title="Import watchlist"
    description={`Import compatible AniList or MyAnimeList identities from ${selectedFile?.name ?? 'the selected file'}.`}
    onclose={close}
>
    {#snippet children()}
        <form
            id="watchlist-import-form"
            method="POST"
            action="?/import"
            enctype="multipart/form-data"
            use:enhance={submit}
            class="p-6 sm:p-7"
        >
            <input type="hidden" name="mode" value={mode} />

            <div class="flex items-start gap-4">
                <WarningIcon
                    class="mt-0.5 shrink-0 text-accent"
                    size="1.75rem"
                    weight="fill"
                    aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                    <p class="text-sm leading-6 text-muted">
                        Choose how Arc should apply the selected watchlist file.
                    </p>
                </div>
            </div>

            <fieldset class="mt-6 grid gap-2">
                <legend class="sr-only">Import behavior</legend>
                <label
                    class="flex cursor-pointer items-start gap-3 border border-border p-4 transition-colors hover:border-muted"
                >
                    <input
                        class="mt-0.5 accent-accent"
                        type="radio"
                        bind:group={mode}
                        value="merge"
                    />
                    <span>
                        <strong class="block text-sm font-semibold">Add and update</strong>
                        <span class="mt-1 block text-xs leading-5 text-muted">
                            Add imported anime and update matching statuses. Keep Arc-only anime.
                        </span>
                    </span>
                </label>
                <label
                    class="flex cursor-pointer items-start gap-3 border border-border p-4 transition-colors hover:border-muted"
                >
                    <input
                        class="mt-0.5 accent-accent"
                        type="radio"
                        bind:group={mode}
                        value="replace"
                    />
                    <span>
                        <strong class="block text-sm font-semibold">Replace everything</strong>
                        <span class="mt-1 block text-xs leading-5 text-muted">
                            Remove the current watchlist first. This cannot be undone.
                        </span>
                    </span>
                </label>
            </fieldset>

            {#if errorMessage}
                <p class="mt-5 text-sm font-medium text-status-error" role="alert">
                    {errorMessage}
                </p>
            {/if}

            <div class="mt-7 flex justify-end gap-3">
                <button
                    type="button"
                    class="min-h-11 px-4 text-sm font-medium text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground"
                    onclick={close}
                    disabled={pending}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    class:bg-status-error={mode === 'replace'}
                    class:bg-accent={mode === 'merge'}
                    class:text-on-status={mode === 'replace'}
                    class:text-on-accent={mode === 'merge'}
                    class="min-h-11 min-w-32 px-5 text-sm font-bold transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                    disabled={pending || !selectedFile}
                >
                    {#if pending}
                        <DataSpinner label="Importing…" />
                    {:else if mode === 'replace'}
                        Replace watchlist
                    {:else}
                        Import watchlist
                    {/if}
                </button>
            </div>
        </form>
    {/snippet}
</Modal>
