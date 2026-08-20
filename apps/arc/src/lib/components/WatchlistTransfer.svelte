<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';
    import { ArrowsLeftRightIcon, CaretDownIcon, DownloadSimpleIcon, UploadSimpleIcon } from 'phosphor-svelte';
    import { z } from 'zod';

    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import Modal from '$lib/components/ui/Modal.svelte';
    import { watchlist } from '$lib/watchlist.svelte';

    type ExportFormat = 'json' | 'csv' | 'xml';
    const exportFormats = ['json', 'csv', 'xml'] as const;
    const actionMessageSchema = z.object({ message: z.string() });

    let importOpen = $state(false);
    let exportOpen = $state(false);
    let fileInput = $state<HTMLInputElement>();
    let selectedFile = $state<File>();
    let replace = $state(false);
    let pending = $state(false);
    let importError = $state('');
    let importResult = $state('');
    let exportFormat = $state<ExportFormat>('json');

    function resetImport() {
        selectedFile = undefined;
        replace = false;
        importError = '';
        importResult = '';
        if (fileInput) {
            fileInput.value = '';
        }
    }

    function openImport() {
        resetImport();
        importOpen = true;
    }

    function closeImport() {
        importOpen = false;
        if (!pending) {
            resetImport();
        }
    }

    const submitImport: SubmitFunction = () => {
        pending = true;
        importError = '';
        importResult = '';

        return async ({ result, update }) => {
            pending = false;
            if (result.type === 'success') {
                const parsed = actionMessageSchema.safeParse(result.data);
                importResult = parsed.success ? parsed.data.message : 'Your watchlist was imported.';
                await Promise.all([update({ reset: false }), watchlist.refresh()]);
                return;
            }
            if (result.type === 'failure') {
                const parsed = actionMessageSchema.safeParse(result.data);
                importError = parsed.success ? parsed.data.message : 'Nothing was changed. The import failed.';
                return;
            }
            await update({ reset: false });
        };
    };
</script>

<Dropdown
    id="watchlist-transfer"
    ariaLabel="Import or export watchlist"
    menuClass="mt-2 w-52 shadow-xl"
    triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground"
>
    {#snippet trigger()}
        <ArrowsLeftRightIcon size="1.2rem" weight="bold" aria-hidden="true" />
        <span class="hidden sm:inline">Import / Export</span>
        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
    {/snippet}

    {#snippet content()}
        <div role="menu" aria-label="Watchlist transfer" class="py-2">
            <button
                type="button"
                role="menuitem"
                class="flex min-h-11 w-full items-center gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                onclick={openImport}
            >
                <UploadSimpleIcon size="1.2rem" aria-hidden="true" />
                Import watchlist
            </button>
            <button
                type="button"
                role="menuitem"
                class="flex min-h-11 w-full items-center gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                onclick={() => (exportOpen = true)}
            >
                <DownloadSimpleIcon size="1.2rem" aria-hidden="true" />
                Export watchlist
            </button>
        </div>
    {/snippet}
</Dropdown>

<Modal
    id="watchlist-import"
    open={importOpen}
    title="Import watchlist"
    description="Add anime from a JSON, CSV, or XML file."
    onclose={closeImport}
>
    {#snippet children()}
        <form
            method="POST"
            action="?/import"
            enctype="multipart/form-data"
            use:enhance={submitImport}
            class="flex min-h-0 flex-col"
            aria-busy={pending}
        >
            <div class="min-h-0 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
                <label
                    class="block cursor-pointer focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-accent"
                >
                    <span class="mb-2 block text-sm font-semibold">Watchlist file</span>
                    <input
                        bind:this={fileInput}
                        id="watchlist-file"
                        name="watchlist"
                        type="file"
                        accept=".json,.csv,.xml,application/json,text/csv,application/xml,text/xml"
                        required
                        class="sr-only"
                        onchange={(event) => {
                            selectedFile = event.currentTarget.files?.[0];
                            importError = '';
                            importResult = '';
                        }}
                    />
                    <span
                        class="flex min-h-24 items-center gap-4 bg-canvas px-5 py-4 transition-colors hover:bg-surface"
                    >
                        <span class="grid size-11 shrink-0 place-items-center bg-panel-strong text-accent">
                            <UploadSimpleIcon size="1.35rem" weight="bold" aria-hidden="true" />
                        </span>
                        <span class="min-w-0">
                            <strong class="block truncate text-sm font-semibold text-foreground">
                                {selectedFile?.name ?? 'Choose a file'}
                            </strong>
                            <span class="mt-1 block text-xs text-muted">
                                {selectedFile
                                    ? `${Math.max(1, Math.ceil(selectedFile.size / 1024))} KB`
                                    : 'JSON, CSV, or XML, up to 2 MB'}
                            </span>
                        </span>
                    </span>
                </label>

                <label
                    class="mt-5 flex cursor-pointer items-center justify-between gap-5 bg-panel-strong px-5 py-4"
                >
                    <span class="min-w-0">
                        <strong class="block text-sm font-semibold">Replace current watchlist</strong>
                        <span class:text-status-error={replace} class="mt-1 block text-xs leading-5 text-muted">
                            {replace
                                ? 'The current watchlist will be removed. This cannot be undone.'
                                : 'Keep existing anime and add only entries that are not already saved.'}
                        </span>
                    </span>
                    <input
                        class="peer sr-only"
                        type="checkbox"
                        name="replace"
                        value="true"
                        bind:checked={replace}
                    />
                    <span
                        class:bg-accent={replace}
                        class:bg-surface={replace === false}
                        class="relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
                        aria-hidden="true"
                    >
                        <span
                            class:translate-x-5={replace}
                            class="absolute top-1 left-1 size-4 rounded-full bg-foreground transition-transform"
                        ></span>
                    </span>
                </label>

                {#if importError}
                    <p
                        class="mt-5 bg-status-error/10 px-4 py-3 text-sm font-medium text-status-error"
                        role="alert"
                    >
                        {importError}
                    </p>
                {/if}
                {#if importResult}
                    <p class="mt-5 bg-accent/10 px-4 py-3 text-sm font-medium text-foreground" role="status">
                        {importResult}
                    </p>
                {/if}
            </div>

            <div class="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4 sm:px-8">
                <button
                    type="button"
                    class="min-h-11 px-4 text-sm font-medium text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground"
                    onclick={closeImport}
                >
                    {importResult ? 'Done' : 'Cancel'}
                </button>
                <button
                    type="submit"
                    class:bg-status-error={replace}
                    class:bg-accent={!replace}
                    class:text-on-status={replace}
                    class:text-on-accent={!replace}
                    class="min-h-11 min-w-36 px-5 text-sm font-bold transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                    disabled={pending || !selectedFile}
                >
                    {pending ? 'Importing...' : replace ? 'Replace watchlist' : 'Import watchlist'}
                </button>
            </div>
        </form>
    {/snippet}
</Modal>

<Modal
    id="watchlist-export"
    open={exportOpen}
    title="Export watchlist"
    description="Download a copy in the same newest-first order shown here."
    onclose={() => (exportOpen = false)}
>
    {#snippet children()}
        <div class="flex min-h-0 flex-col">
            <div class="px-6 py-6 sm:px-8 sm:py-7">
                <fieldset>
                    <legend class="mb-3 text-sm font-semibold">File format</legend>
                    <div class="grid grid-cols-3 gap-1 bg-canvas p-1">
                        {#each exportFormats as format}
                            <label class="cursor-pointer">
                                <input
                                    class="peer sr-only"
                                    type="radio"
                                    bind:group={exportFormat}
                                    value={format}
                                />
                                <span
                                    class:bg-panel-strong={exportFormat === format}
                                    class:text-foreground={exportFormat === format}
                                    class="grid min-h-12 place-items-center px-3 text-sm font-semibold text-muted transition-colors hover:text-foreground peer-focus-visible:outline-1 peer-focus-visible:outline-accent"
                                >
                                    {format.toUpperCase()}
                                </span>
                            </label>
                        {/each}
                    </div>
                </fieldset>

                <p class="mt-5 text-sm leading-6 text-muted">
                    The file includes each anime's AniList ID, status, added date, and activity date.
                </p>
            </div>

            <div class="flex justify-end gap-3 border-t border-border px-6 py-4 sm:px-8">
                <button
                    type="button"
                    class="min-h-11 px-4 text-sm font-medium text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground"
                    onclick={() => (exportOpen = false)}
                >
                    Cancel
                </button>
                <a
                    href={`/watchlist/export?format=${exportFormat}`}
                    download
                    class="inline-flex min-h-11 items-center gap-2 bg-accent px-5 text-sm font-bold text-on-accent transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onclick={() => (exportOpen = false)}
                >
                    <DownloadSimpleIcon size="1.2rem" aria-hidden="true" />
                    Download {exportFormat.toUpperCase()}
                </a>
            </div>
        </div>
    {/snippet}
</Modal>
