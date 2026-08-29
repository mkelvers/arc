<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import { CaretDownIcon, CircleNotchIcon } from 'phosphor-svelte';

    import { AnimeCardPageSchema, type AnimeCard as AnimeCardModel } from '@arc/shared/types';
    import emptyArtwork from '$lib/assets/simulcast-empty.png';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import { m } from '$lib/paraglide/messages.js';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let loadedSelection = untrack(() => `${data.season}:${data.year}`);
    let anime = $state<AnimeCardModel[]>(untrack(() => data.page.anime));
    let nextPage = $state<number | null>(untrack(() => (data.page.hasNextPage ? data.page.page + 1 : null)));
    let loading = $state(false);
    let sentinel = $state<HTMLDivElement>();
    let activeRequest: AbortController | undefined;

    async function loadMore() {
        const page = nextPage;
        if (page === null || loading) {
            return;
        }

        const requestSelection = loadedSelection;
        const controller = new AbortController();
        activeRequest?.abort();
        activeRequest = controller;
        loading = true;

        try {
            const query = new URLSearchParams({
                season: data.season.toLowerCase(),
                year: String(data.year),
                page: String(page),
            });
            const response = await fetch(`/v1/simulcast?${query}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Simulcast page request returned ${response.status}`);
            }

            const result = AnimeCardPageSchema.safeParse(await response.json());
            if (!result.success || result.data.page !== page) {
                throw new TypeError('Simulcast page request returned an invalid response');
            }
            if (loadedSelection !== requestSelection) {
                return;
            }

            const existing = new Set(anime.map(({ id }) => id));
            anime = [...anime, ...result.data.anime.filter(({ id }) => !existing.has(id))];
            nextPage = result.data.hasNextPage ? page + 1 : null;
        } catch (cause) {
            if (!(cause instanceof DOMException) || cause.name !== 'AbortError') {
                console.warn(`Simulcast page ${page} could not be loaded`, cause);
            }
        } finally {
            if (activeRequest === controller) {
                activeRequest = undefined;
                loading = false;
            }
        }
    }

    $effect(() => {
        const selection = `${data.season}:${data.year}`;
        if (selection === loadedSelection) {
            return;
        }

        activeRequest?.abort();
        loadedSelection = selection;
        anime = data.page.anime;
        nextPage = data.page.hasNextPage ? data.page.page + 1 : null;
        loading = false;
    });

    $effect(() => {
        if (!sentinel || nextPage === null) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    void loadMore();
                }
            },
            { rootMargin: '600px 0px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    onDestroy(() => activeRequest?.abort());
</script>

<svelte:head>
    <title>Arc — {data.label} {m.simulcast_title()}</title>
    <meta name="description" content={m.simulcast_title()} />
</svelte:head>

<main class="min-h-dvh overflow-x-clip bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
    <section class="mx-auto w-full max-w-264" aria-labelledby="simulcast-title">
        <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 id="simulcast-title" class="text-xl font-bold sm:text-2xl">{m.simulcast_title()}</h1>
            <Dropdown
                id="simulcast-season"
                items={data.options}
                ariaLabel={m.simulcast_choose({ label: data.label })}
                menuClass="top-full left-0 mt-2 max-h-80 min-w-48 overflow-y-auto shadow-xl right-auto sm:right-0 sm:left-auto"
                triggerClass="flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
            >
                {#snippet trigger()}
                    <CaretDownIcon size="1rem" weight="bold" class="text-muted" aria-hidden="true" />
                    <span>{data.label}</span>
                {/snippet}
            </Dropdown>
        </div>

        {#if anime.length}
            <div
                class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-[1.875rem] lg:gap-y-12 xl:grid-cols-6"
            >
                {#each anime as entry (entry.id)}
                    <AnimeCard anime={entry} truncateTitle={false} />
                {/each}
            </div>
        {:else}
            <EmptyState
                artwork={emptyArtwork}
                artworkWidth={1254}
                artworkHeight={1254}
                id="empty-simulcast-message"
                body={m.simulcast_empty({ label: data.label })}
            />
        {/if}

        {#if nextPage !== null}
            <div bind:this={sentinel} class="flex min-h-24 items-center justify-center" aria-live="polite">
                {#if loading}
                    <CircleNotchIcon
                        size="2rem"
                        weight="bold"
                        class="animate-spin text-accent motion-reduce:animate-none"
                        aria-label={m.simulcast_loading()}
                    />
                {:else}
                    <span class="sr-only">{m.simulcast_auto_loading()}</span>
                {/if}
            </div>
        {/if}
    </section>
</main>
