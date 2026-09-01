<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from '@sveltejs/kit';

    import StatusBanner from '$lib/components/StatusBanner.svelte';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { watchlist } from '$lib/watchlist.svelte';
    import { m } from '$lib/i18n.svelte';
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
    <title>Arc — {m.settings_watchlist()}</title>
    <meta name="description" content={m.settings_watchlist_synopsis()} />
</svelte:head>

<div class="space-y-12">
    <section aria-labelledby="import-library">
        <header>
            <h2 id="import-library" class="text-base font-medium text-foreground">
                {m.import_library()}
            </h2>
            <p class="mt-1 text-sm leading-relaxed text-muted">{m.import_json_csv_body()}</p>
        </header>

        <div class="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end sm:gap-x-8">
            <label class="flex cursor-pointer items-start gap-3 text-sm text-muted">
                <span class="mt-0.5">
                    <Checkbox bind:checked={replaceWatchlist} aria-label={m.import_replace()} />
                </span>
                <span>
                    <span class="font-medium text-foreground">{m.import_replace()}</span>
                    <span class="mt-1 block text-xs leading-5 text-muted">
                        {m.import_replace_body()}
                    </span>
                </span>
            </label>

            <form
                method="POST"
                action="?/import"
                enctype="multipart/form-data"
                use:enhance={enhanceImport}
                class="w-full"
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
                    class="inline-flex min-h-10 w-full cursor-pointer items-center justify-center border border-border-strong px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
                >
                    {m.import_choose_file()}
                </label>
            </form>
        </div>
    </section>

    <StatusBanner
        message={form && form !== dismissedForm ? (form.message ?? '') : ''}
        tone={form?.success ? 'success' : 'error'}
        ondismiss={() => (dismissedForm = form)}
    />

    <section aria-labelledby="export-library">
        <div class="flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div class="min-w-0">
                <h2 id="export-library" class="text-base font-medium text-foreground">
                    {m.export_library()}
                </h2>
                <p class="mt-1 text-sm leading-relaxed text-muted">{m.export_download()}</p>
            </div>
            <a
                href="/v1/watchlist/export?format=json"
                download
                class="inline-flex min-h-10 w-full shrink-0 items-center justify-center border border-border-strong px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-36"
            >
                {m.download()}
            </a>
        </div>
    </section>
</div>
