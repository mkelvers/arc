<script lang="ts">
    import WatchlistPageContent from './_components/WatchlistPageContent.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/i18n.svelte';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — {m.watchlist_title()}</title>
    <meta
        name="description"
        content="Keep track of the anime you want to watch, are watching, and have finished."
    />
</svelte:head>

{#await data.page}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
        <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <h1 class="text-2xl font-semibold">{m.watchlist_title()}</h1>
            <section class="mt-8 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-live="polite">
                <span class="sr-only">{m.watchlist_loading()}</span>
                <div class="h-12 border-b border-border" aria-hidden="true"></div>
                <div
                    class="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-[1.875rem] lg:gap-y-12 xl:grid-cols-6 2xl:grid-cols-7"
                    aria-hidden="true"
                >
                    {#each Array.from({ length: 12 }) as _}
                        <div>
                            <div class="aspect-2/3 bg-surface"></div>
                            <div class="mt-3 h-4 w-4/5 bg-surface"></div>
                            <div class="mt-2 h-3 w-2/5 bg-surface"></div>
                        </div>
                    {/each}
                </div>
            </section>
        </div>
    </main>
{:then result}
    {#if result.status === 'success'}
        <WatchlistPageContent data={{ ...result.data, selection: data.selection }} />
    {:else}
        <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas px-5 py-12 text-foreground">
            <p class="mx-auto max-w-384 text-sm text-muted" role="alert">
                {m.watchlist_load_failed()}
            </p>
        </main>
    {/if}
{/await}
