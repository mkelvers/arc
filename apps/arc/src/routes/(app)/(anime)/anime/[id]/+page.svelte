<script lang="ts">
    import { invalidate } from '$app/navigation';

    import AnimePageContent from './_components/AnimePageContent.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/i18n.svelte';

    let { data }: PageProps = $props();
    let title = $state('Arc — Anime');
    let description = $state<string>(m.anime_loading());
    let retrying = $state(false);

    async function retry() {
        retrying = true;
        try {
            await invalidate(`arc:anime:${data.animeId}:episodes`);
        } finally {
            retrying = false;
        }
    }

    $effect(() => {
        let current = true;

        void data.page.then((result) => {
            if (current && result.status === 'success') {
                title = `Arc — Watch ${result.data.anime.title}`;
                description = result.data.anime.description;
            }
        });

        return () => {
            current = false;
        };
    });
</script>

<svelte:head>
    <title>{title}</title>
    <meta name="description" content={description} />
</svelte:head>

{#await data.page}
    <main class="min-h-dvh bg-canvas text-foreground" aria-busy="true" aria-live="polite">
        <span class="sr-only">{m.anime_loading()}</span>
        <section
            class="grid h-dvh min-h-120 max-h-192 animate-pulse grid-cols-1 grid-rows-1 bg-black motion-reduce:animate-none sm:min-h-150 lg:min-h-175 lg:max-h-300"
            aria-hidden="true"
        >
            <div class="col-start-1 row-start-1 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-20">
                <div class="h-16 w-3/5 max-w-xl bg-surface/70"></div>
                <div class="mt-8 h-4 w-2/5 max-w-md bg-surface/70"></div>
                <div class="mt-4 h-5 w-1/3 max-w-sm bg-surface/70"></div>
                <div class="mt-7 h-10 w-48 bg-surface/70"></div>
            </div>
        </section>
        <div class="animate-pulse px-5 py-8 motion-reduce:animate-none sm:px-10 lg:px-16" aria-hidden="true">
            <div class="h-4 w-full max-w-3xl bg-surface"></div>
            <div class="mt-3 h-4 w-4/5 max-w-2xl bg-surface"></div>
            <div class="mt-12 grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
                {#each Array.from({ length: 5 }) as _}
                    <div>
                        <div class="aspect-video bg-surface"></div>
                        <div class="mt-3 h-4 w-4/5 bg-surface"></div>
                    </div>
                {/each}
            </div>
        </div>
    </main>
{:then result}
    {#if result.status === 'success'}
        <AnimePageContent data={result.data} />
    {:else}
        <main class="grid min-h-[calc(100dvh-3.5rem)] place-items-center bg-canvas px-5 text-foreground">
            <div class="max-w-md text-center" role="alert">
                <h1 class="text-2xl font-semibold">
                    {result.status === 'not-found' ? m.anime_not_found() : m.anime_load_failed()}
                </h1>
                <p class="mt-3 text-sm text-muted">
                    {result.status === 'not-found' ? m.anime_unavailable() : m.anime_load_error()}
                </p>
                {#if result.status === 'error'}
                    <button
                        type="button"
                        class="mt-6 min-h-10 bg-accent px-5 text-sm font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
                        disabled={retrying}
                        onclick={retry}
                    >
                        {retrying ? m.retrying() : m.retry()}
                    </button>
                {/if}
            </div>
        </main>
    {/if}
{/await}
