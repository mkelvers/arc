<script lang="ts">
    import StatusBanner from '$lib/components/StatusBanner.svelte';

    let { form } = $props();
    let dismissedForm = $state<unknown>();
    const statusMessage = $derived(form && form !== dismissedForm ? (form.message ?? '') : '');
</script>

<section aria-labelledby="import-library">
    <h2 id="import-library" class="text-sm font-medium text-foreground">Import Library</h2>

    <div class="mt-5 space-y-7">
        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">AniList</h3>
                <p class="mt-1 leading-relaxed text-muted">Import your current AniList library.</p>
            </div>
            <form method="POST" action="?/importAniList">
                <button
                    type="submit"
                    class="shrink-0 text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >Import from AniList</button
                >
            </form>
        </div>

        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">MyAnimeList XML</h3>
                <p class="mt-1 leading-relaxed text-muted">
                    Import a standard MyAnimeList XML export.
                </p>
            </div>
            <form method="POST" action="?/importMal" enctype="multipart/form-data" class="shrink-0">
                <input
                    id="mal-import"
                    name="file"
                    type="file"
                    accept=".xml,application/xml,text/xml"
                    class="sr-only"
                    onchange={(event) => event.currentTarget.form?.requestSubmit()}
                />
                <label
                    for="mal-import"
                    class="inline-flex min-h-8 cursor-pointer items-center border border-border-strong px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-accent"
                    >Choose File</label
                >
            </form>
        </div>

        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">Universal Import</h3>
                <p class="mt-1 leading-relaxed text-muted">
                    Import anime from JSON, XML, or CSV files.
                </p>
            </div>
            <form
                method="POST"
                action="?/importUniversal"
                enctype="multipart/form-data"
                class="shrink-0"
            >
                <input
                    id="universal-import"
                    name="file"
                    type="file"
                    accept=".json,.xml,.csv,application/json,application/xml,text/xml,text/csv"
                    class="sr-only"
                    onchange={(event) => event.currentTarget.form?.requestSubmit()}
                />
                <label
                    for="universal-import"
                    class="inline-flex min-h-8 cursor-pointer items-center border border-border-strong px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-accent"
                    >Choose File</label
                >
            </form>
        </div>
    </div>
</section>

<StatusBanner
    message={statusMessage}
    tone={form?.success ? 'success' : 'error'}
    ondismiss={() => (dismissedForm = form)}
/>

<section class="mt-10" aria-labelledby="export-library">
    <h2 id="export-library" class="text-sm font-medium text-foreground">Export Library</h2>
    <p class="mt-1 text-sm leading-relaxed text-muted">
        Download a copy of your Arc anime library.
    </p>

    <div class="mt-5 space-y-7">
        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">Arc JSON</h3>
                <p class="mt-1 leading-relaxed text-muted">
                    Complete portable copy of your library.
                </p>
            </div>
            <a
                href="/watchlist/export"
                class="shrink-0 text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >Export</a
            >
        </div>

        <div class="flex items-start justify-between gap-6 text-sm">
            <div>
                <h3 class="text-sm text-foreground">MyAnimeList XML</h3>
                <p class="mt-1 leading-relaxed text-muted">
                    Export in a format compatible with MyAnimeList.
                </p>
            </div>
            <a
                href="/settings/import-export/export/mal"
                class="shrink-0 text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >Export</a
            >
        </div>
    </div>
</section>
