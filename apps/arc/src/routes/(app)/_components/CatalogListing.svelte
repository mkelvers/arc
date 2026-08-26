<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import { ChartBarIcon, CircleNotchIcon, SortDescendingIcon } from 'phosphor-svelte';

    import { AnimeCardPageSchema, type AnimeCard as AnimeCardModel } from '@arc/shared/types';
    import AnimeCard from '$lib/components/AnimeCard.svelte';

    interface Props {
        kind: 'new' | 'popular';
        initialAnime: AnimeCardModel[];
        initialHasNextPage: boolean;
        initialPage: number;
        loadedAt: string;
    }

    let { kind, initialAnime, initialHasNextPage, initialPage, loadedAt }: Props = $props();
    let anime = $state<AnimeCardModel[]>(untrack(() => initialAnime));
    let nextPage = $state<number | null>(untrack(() => (initialHasNextPage ? initialPage + 1 : null)));
    let loading = $state(false);
    let sentinel = $state<HTMLDivElement>();
    let activeRequest: AbortController | undefined;
    const loadedAtMs = untrack(() => new Date(loadedAt).getTime());
    const sections = $derived.by(() => {
        if (kind === 'popular') {
            return [{ title: 'Popular', anime }];
        }

        const groups = [
            { title: 'Last 24 Hours', anime: [] as AnimeCardModel[] },
            { title: 'This Past Week', anime: [] as AnimeCardModel[] },
            { title: 'Earlier', anime: [] as AnimeCardModel[] },
        ];
        for (const entry of anime) {
            const age = Math.max(0, loadedAtMs - new Date(entry.addedAt ?? loadedAt).getTime());
            groups[age < 24 * 60 * 60 * 1_000 ? 0 : age < 7 * 24 * 60 * 60 * 1_000 ? 1 : 2]!.anime.push(entry);
        }
        return groups.filter((group) => group.anime.length);
    });
    const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

    function addedLabel(addedAt: string | undefined) {
        const ageMs = Math.max(0, loadedAtMs - new Date(addedAt ?? loadedAt).getTime());
        const minutes = Math.floor(ageMs / 60_000);
        if (minutes < 60) {
            return relativeTime.format(-Math.max(1, minutes), 'minute');
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return relativeTime.format(-hours, 'hour');
        }
        return relativeTime.format(-Math.floor(hours / 24), 'day');
    }

    async function loadMore() {
        const page = nextPage;
        if (page === null || loading) {
            return;
        }

        const controller = new AbortController();
        activeRequest?.abort();
        activeRequest = controller;
        loading = true;

        try {
            const response = await fetch(`/v1/${kind}?page=${page}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`${kind} page request returned ${response.status}`);
            }
            const result = AnimeCardPageSchema.safeParse(await response.json());
            if (!result.success || result.data.page !== page) {
                throw new TypeError(`${kind} page request returned an invalid response`);
            }

            const existing = new Set(anime.map(({ id }) => id));
            anime = [...anime, ...result.data.anime.filter(({ id }) => !existing.has(id))];
            nextPage = result.data.hasNextPage ? page + 1 : null;
        } catch (cause) {
            if (!(cause instanceof DOMException) || cause.name !== 'AbortError') {
                console.warn(`${kind} page ${page} could not be loaded`, cause);
            }
        } finally {
            if (activeRequest === controller) {
                activeRequest = undefined;
                loading = false;
            }
        }
    }

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

<main class="min-h-dvh bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
    <section class="mx-auto w-full max-w-264" aria-labelledby="catalog-title">
        <div class="mb-8 flex items-center justify-between gap-4">
            <h1 id="catalog-title" class="text-2xl font-bold">
                {kind === 'new' ? 'Newly Added Anime' : 'Most Popular Anime'}
            </h1>
            <a
                href={kind === 'new' ? '/popular' : '/new'}
                class="inline-flex h-11 items-center gap-2 px-3 text-sm font-semibold text-muted uppercase transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
                {#if kind === 'new'}
                    <ChartBarIcon size="1.15rem" aria-hidden="true" />
                    Popularity
                {:else}
                    <SortDescendingIcon size="1.15rem" aria-hidden="true" />
                    Newest
                {/if}
            </a>
        </div>

        {#each sections as section (section.title)}
            <section class="mb-12" aria-labelledby={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}>
                <h2
                    id={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}
                    class="mb-4 text-base font-bold"
                >
                    {section.title}
                </h2>
                <div
                    class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-[1.875rem] lg:gap-y-12 xl:grid-cols-6"
                >
                    {#each section.anime as entry (entry.id)}
                        <AnimeCard anime={entry} meta={kind === 'new' ? addedLabel(entry.addedAt) : undefined} />
                    {/each}
                </div>
            </section>
        {/each}

        {#if !anime.length}
            <p class="py-20 text-center text-muted">No anime are available yet.</p>
        {/if}

        {#if nextPage !== null}
            <div bind:this={sentinel} class="flex min-h-24 w-full items-center justify-center" aria-live="polite">
                {#if loading}
                    <CircleNotchIcon
                        size="2rem"
                        weight="bold"
                        class="animate-spin text-accent motion-reduce:animate-none"
                        aria-label="Loading more anime"
                    />
                {:else}
                    <span class="sr-only">More anime load automatically while scrolling.</span>
                {/if}
            </div>
        {/if}
    </section>
</main>
