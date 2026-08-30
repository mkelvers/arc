<script lang="ts">
    import { invalidate } from '$app/navigation';

    import AnimePageContent from './_components/AnimePageContent.svelte';
    import PageLoading from '$lib/components/ui/PageLoading.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/i18n.svelte';

    let { data }: PageProps = $props();
    let title = $state('Arc — Anime');
    let description = $state<string>(m.anime_loading());
    let retrying = $state(false);

    async function retry() {
        retrying = true;
        try {
            await invalidate(`arc:anime:${data.animeId}:overview`);
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
    <PageLoading label={m.anime_loading()} />
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
