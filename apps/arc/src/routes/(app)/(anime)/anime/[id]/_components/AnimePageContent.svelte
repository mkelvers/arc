<script lang="ts">
    import { onMount, untrack } from 'svelte';

    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import EpisodeGridCard from '$lib/components/EpisodeGridCard.svelte';
    import FranchiseOrder from './FranchiseOrder.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import AiringStatus from './AiringStatus.svelte';
    import WatchlistStatusMenu from './WatchlistStatusMenu.svelte';
    import { AnimePageEpisodeUpdatesSchema, type AnimePageEpisodeUpdates } from '@arc/core/client';
    import { cn } from '$lib/utils';
    import type { PageData } from '../$types';
    import { DotsThreeVerticalIcon, PlayIcon } from 'phosphor-svelte';
    import { m } from '$lib/i18n.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Props = { data: Extract<PageResult, { status: 'success' }>['data'] };

    let { data }: Props = $props();
    const initialData = untrack(() => data);

    let anime = $derived(data.anime);
    let artwork = $derived(data.artwork);
    let episodes = $state(initialData.episodes);
    let watchAction = $state(initialData.watchAction);
    let audioLabel = $state(initialData.audioLabel);
    let episodeRevision = $state(initialData.episodeRevision);
    let franchise = $derived(data.franchise);
    let detailsExpanded = $state(false);
    let visibleEpisodeCount = $state(28);
    let loadedAnimeId = $state(initialData.anime.id);

    $effect(() => {
        if (loadedAnimeId !== data.anime.id) {
            loadedAnimeId = data.anime.id;
            episodes = data.episodes;
            watchAction = data.watchAction;
            audioLabel = data.audioLabel;
            episodeRevision = data.episodeRevision;
            visibleEpisodeCount = 28;
        }
    });

    onMount(() => {
        if (anime.status !== 'RELEASING') {
            return;
        }

        const controller = new AbortController();
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        let warned = false;

        const poll = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const query = new URLSearchParams({
                        known: episodes.map(({ id }) => id).join(','),
                    });
                    if (episodeRevision) {
                        query.set('revision', episodeRevision);
                    }

                    const response = await fetch(`/v1/anime/${anime.id}/episodes/updates?${query}`, {
                        cache: 'no-store',
                        signal: controller.signal,
                    });
                    if (!response.ok) {
                        throw new Error(`Episode update request failed with ${response.status}`);
                    }

                    const result: AnimePageEpisodeUpdates = AnimePageEpisodeUpdatesSchema.parse(
                        await response.json()
                    );
                    warned = false;
                    if (result.revision !== episodeRevision) {
                        episodes = result.replace
                            ? result.episodes
                            : [...episodes, ...result.episodes].toSorted(
                                  (left, right) => left.number - right.number
                              );
                        visibleEpisodeCount = Math.max(visibleEpisodeCount, episodes.length);
                        watchAction = result.watchAction;
                        audioLabel = result.audioLabel;
                        episodeRevision = result.revision;
                    }
                } catch (cause) {
                    if (!controller.signal.aborted && !warned) {
                        warned = true;
                        console.warn(`Episode update check failed for AniList ${anime.id}`, cause);
                    }
                }
            }

            if (!stopped) {
                timer = setTimeout(poll, 60_000);
            }
        };

        timer = setTimeout(poll, 60_000);

        return () => {
            stopped = true;
            controller.abort();
            clearTimeout(timer);
        };
    });

    function showMoreEpisodes(total: number) {
        visibleEpisodeCount = Math.min(total, visibleEpisodeCount + 28);
    }
</script>

<main class="bg-canvas text-foreground">
    <h1 class="sr-only">{anime.title}</h1>
    <section>
        <figure
            class="anime-hero relative z-30 grid h-[calc(100dvh-10rem)] min-h-120 max-h-192 grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:col-start-1 before:row-start-1 before:z-10 before:h-full after:pointer-events-none after:col-start-1 after:row-start-1 after:z-10 after:h-full sm:min-h-150 lg:min-h-175 lg:max-h-300"
        >
            {#if artwork?.selectedBackdrop}
                <div class="absolute inset-0 overflow-hidden">
                    <ProgressiveImage
                        src={artwork.selectedBackdrop.url}
                        alt={anime.title}
                        previewSize="w300"
                        class="absolute inset-x-0 top-0 z-0 h-dvh w-full"
                        imageClass="object-[45%_0%]"
                    />
                </div>
            {/if}

            <div
                class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end font-bold sm:mt-5 sm:mr-8 lg:mr-12"
            >
                <Dropdown id="more-options" menuClass="w-56">
                    {#snippet trigger()}
                        <span class="flex min-h-11 items-center gap-3 text-sm leading-none">
                            <DotsThreeVerticalIcon size="1.5rem" weight="bold" aria-hidden="true" />
                            <span>{m.anime_more()}</span>
                        </span>
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label={m.anime_more()} class="w-56 bg-panel py-2">
                            <a
                                role="menuitem"
                                href={`/anime/${anime.id}/media`}
                                data-dropdown-close
                                class="block px-5 py-3 text-sm leading-tight font-normal text-muted whitespace-nowrap hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.anime_view_media()}
                            </a>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>

            <div class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-20">
                <div class="w-fit">
                    {#if artwork?.selectedLogo}
                        <img
                            src={artwork.selectedLogo.url}
                            alt={anime.title}
                            style:height={`clamp(${(5 * artwork.logoSize) / 100}rem, ${(6.4 * artwork.logoSize) / 100}vw, ${(8 * artwork.logoSize) / 100}rem)`}
                            class="max-w-[65vw] object-contain object-left sm:max-w-md lg:max-w-lg 2xl:max-w-2xl"
                        />
                    {:else}
                        <h1 class="max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
                            {anime.title}
                        </h1>
                    {/if}
                </div>

                {#if anime.status === 'RELEASING' && anime.nextAiringEpisode}
                    <AiringStatus airingAt={anime.nextAiringEpisode.airingAt} />
                {/if}

                <p
                    class={cn(
                        'flex flex-wrap items-center gap-y-1 text-sm text-muted lg:text-base',
                        anime.status === 'RELEASING' && anime.nextAiringEpisode ? 'mt-3' : 'mt-8 sm:mt-10 lg:mt-11'
                    )}
                >
                    {#if audioLabel}
                        <span class="metadata-tag">{audioLabel}</span>
                    {/if}
                    {#if anime.genres.length}
                        <span class="metadata-tag">
                            {#each anime.genres as genre, index}
                                {#if index > 0}
                                    <span aria-hidden="true">,</span>
                                {/if}
                                <a
                                    class="underline underline-offset-2"
                                    href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                >
                                    {genre}
                                </a>
                            {/each}
                        </span>
                    {/if}
                </p>

                <div
                    class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:text-base lg:mt-3.5 lg:gap-2.5 lg:text-base"
                >
                    <span class="relative flex items-center gap-0.5 text-subtle" aria-hidden="true">
                        {#each Array(5) as _, index}
                            <svg
                                class:text-foreground={index < Math.round(anime.score / 20)}
                                class="size-6 shrink-0 fill-current sm:size-7"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    d="m12 2 2.85 6.59L22 9.27 16.55 14l1.63 7L12 17.27 5.82 21l1.63-7L2 9.27l7.15-.68z"
                                />
                            </svg>
                        {/each}
                    </span>
                    <span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>
                    <strong>
                        {m.shared_score({
                            provider:
                                anime.scoreSource === 'Kitsu'
                                    ? m.shared_score_provider_kitsu()
                                    : m.shared_score_provider_anilist(),
                            score: anime.score,
                        })}
                    </strong>
                </div>

                <div
                    class="mt-7 flex max-sm:flex-wrap items-center gap-2 text-xs font-bold text-accent sm:text-sm lg:mt-8 lg:gap-2.5"
                >
                    <a
                        href={watchAction.href}
                        class="flex h-10 items-center gap-2.5 bg-accent px-4 text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] sm:px-6"
                    >
                        <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                        {watchAction.kind === 'continue'
                            ? m.anime_continue_watching({ episode: watchAction.episode ?? '' })
                            : watchAction.kind === 'rewatch'
                              ? m.anime_rewatch()
                              : watchAction.kind === 'start'
                                ? m.anime_start_watching({ episode: watchAction.episode ?? '' })
                                : m.anime_view_episodes()}
                    </a>
                    <WatchlistBookmark animeId={anime.id} title={anime.title} iconSize="1.65em" outlined />
                    <WatchlistStatusMenu
                        animeId={anime.id}
                        title={anime.title}
                        initialState={data.watchlistState ?? undefined}
                    />
                </div>
            </div>
        </figure>

        <div class="relative z-20 bg-canvas px-5 sm:px-10 lg:px-16">
            <div class="border-b border-border pt-7 lg:pt-8">
                <div
                    class={cn(
                        'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                        detailsExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    )}
                >
                    <section
                        id="anime-details"
                        class={cn(
                            'grid min-h-24 min-w-0 max-w-432 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-2 md:gap-12 lg:gap-28 lg:text-sm lg:leading-6',
                            !detailsExpanded && 'mask-[linear-gradient(to_bottom,black_45%,transparent_100%)]'
                        )}
                    >
                        <p class="max-w-3xl text-foreground">{anime.description}</p>
                        <div class="space-y-3">
                            <p>
                                <strong class="font-normal text-foreground">{m.anime_production()}</strong>
                                {anime.studios.join(', ')}
                            </p>
                            <p>
                                <strong class="font-normal text-foreground">{m.anime_key_staff()}</strong>
                                {anime.staff}
                            </p>
                            <p>
                                <strong class="font-normal text-foreground">{m.anime_rankings()}</strong>
                                {anime.rankings.join(', ')}
                            </p>
                            <p>
                                <strong class="font-normal text-foreground">{m.anime_audience()}</strong>
                                {m.anime_members_favorites({
                                    members: anime.members,
                                    favorites: anime.favourites,
                                })}
                            </p>
                            <p>
                                <strong class="font-normal text-foreground">{m.anime_themes()}</strong>
                                {anime.themes.join(', ')}
                            </p>
                            <p>
                                <strong class="font-normal text-foreground">{m.anime_genres()}</strong>
                                {#each anime.genres as genre, index}
                                    {#if index > 0}
                                        <span aria-hidden="true">,</span>
                                    {/if}
                                    <a
                                        class="underline underline-offset-2"
                                        href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                    >
                                        {genre}
                                    </a>
                                {/each}
                            </p>
                        </div>
                    </section>
                </div>

                <Button
                    variant="unstyled"
                    type="button"
                    class="min-h-11 text-xs font-semibold text-accent uppercase"
                    aria-expanded={detailsExpanded}
                    aria-controls="anime-details"
                    onclick={() => (detailsExpanded = !detailsExpanded)}
                >
                    {detailsExpanded ? m.anime_fewer_details() : m.anime_more_details()}
                </Button>
            </div>
        </div>
    </section>

    <div class="px-3 sm:px-8 lg:px-14">
        <section
            id="anime-episode-list"
            class="px-2 py-7 sm:pb-12 lg:pb-16"
            aria-labelledby="anime-episodes-title"
            aria-live="polite"
        >
            <h2 id="anime-episodes-title" class="sr-only">{m.player_episodes()}</h2>
            {#if episodes.length}
                <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 hero:grid-cols-7">
                    {#each episodes.slice(0, visibleEpisodeCount) as episode}
                        <EpisodeGridCard
                            episode={episode}
                            title={anime.title}
                            image={artwork?.selectedBackdrop?.url ?? null}
                        />
                    {/each}
                </div>
                {#if visibleEpisodeCount < episodes.length}
                    <Button
                        variant="unstyled"
                        type="button"
                        class="mx-auto mt-8 flex min-h-11 w-full max-w-5xl items-center justify-center bg-[#192e38] px-5 text-xs font-bold text-white uppercase hover:brightness-[1.2] focus:outline-none active:outline-none"
                        onclick={() => showMoreEpisodes(episodes.length)}
                    >
                        {m.anime_show_more_episodes()}
                    </Button>
                {/if}
            {/if}
        </section>

        {#if franchise?.entries.length}
            <FranchiseOrder order={franchise} currentAnimeId={anime.id} />
        {/if}
    </div>
</main>
