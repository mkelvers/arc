<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';

    import StatusBanner from '$lib/components/StatusBanner.svelte';
    import { watchlist } from '$lib/watchlist.svelte';
    import type { PageProps } from './$types';

    let { form }: PageProps = $props();
    let dismissedForm = $state.raw<unknown>();
    let replaceWatchlist = $state(false);

    const enhanceImport: SubmitFunction = () => {
        return async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success') {
                await watchlist.refresh();
            }
        };
    };
</script>

<svelte:head>
    <title>Arc — Watchlist import and export</title>
    <meta name="description" content="Import or export your Arc watchlist." />
</svelte:head>

<section aria-labelledby="import-library">
    <h2 id="import-library" class="text-sm font-medium text-foreground">Import Library</h2>

    <div class="mt-5">
        <label class="flex cursor-pointer items-start gap-3 text-sm text-muted">
            <span class="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
                <input
                    bind:checked={replaceWatchlist}
                    type="checkbox"
                    class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
                    aria-label="Replace current watchlist"
                />
                <span
                    class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-accent transition-colors peer-hover:border-accent peer-checked:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-checked:[&>svg]:opacity-100"
                    aria-hidden="true"
                >
                    <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
                        <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                </span>
            </span>
            <span>
                <span class="font-medium text-foreground">Replace current watchlist</span>
                <span class="mt-1 block text-xs leading-5 text-muted">
                    Remove entries not included in the imported file. Leave this off to add only anime that is not
                    already in your watchlist.
                </span>
            </span>
        </label>
    </div>

    <div class="mt-7">
        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">JSON or CSV</h3>
                <p class="mt-1 leading-relaxed text-muted">Import anime from a JSON or CSV file.</p>
            </div>
            <form
                method="POST"
                action="?/import"
                enctype="multipart/form-data"
                use:enhance={enhanceImport}
                class="shrink-0"
            >
                <input type="hidden" name="mode" value={replaceWatchlist ? 'replace' : 'add'} />
                <input
                    id="watchlist-import"
                    name="file"
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    class="sr-only"
                    onchange={(event) => event.currentTarget.form?.requestSubmit()}
                />
                <label
                    for="watchlist-import"
                    class="inline-flex min-h-8 cursor-pointer items-center border border-border-strong px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
                >
                    Choose File
                </label>
            </form>
        </div>
    </div>
</section>

<StatusBanner
    message={form && form !== dismissedForm ? (form.message ?? '') : ''}
    tone={form?.success ? 'success' : 'error'}
    ondismiss={() => (dismissedForm = form)}
/>

<section class="mt-10" aria-labelledby="export-library">
    <h2 id="export-library" class="text-sm font-medium text-foreground">Export Library</h2>
    <p class="mt-1 text-sm leading-relaxed text-muted">Download a copy of your Arc anime library.</p>

    <div class="mt-5 space-y-7">
        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">Arc JSON</h3>
                <p class="mt-1 leading-relaxed text-muted">Complete portable copy of your library.</p>
            </div>
            <a
                href="/v1/watchlist/export?format=json"
                download
                class="shrink-0 text-accent transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Export
            </a>
        </div>

        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">Arc CSV</h3>
                <p class="mt-1 leading-relaxed text-muted">Spreadsheet-friendly copy of your library.</p>
            </div>
            <a
                href="/v1/watchlist/export?format=csv"
                download
                class="shrink-0 text-accent transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Export
            </a>
        </div>
    </div>
</section>
