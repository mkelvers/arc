<script lang="ts">
    import { DotsThreeVerticalIcon, PlayIcon } from 'phosphor-svelte';

    import { type AnimeArtwork, type AnimePageDeferred, type AnimePageOverview } from '@arc/core/client';
    import AiringStatus from './AiringStatus.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import WatchlistStatusMenu from './WatchlistStatusMenu.svelte';
    import { cn } from '$lib/utils';
    import { m } from '$lib/i18n.svelte';

    type Props = {
        anime: AnimePageDeferred['anime'];
        artwork: AnimeArtwork;
        audioLabel: string;
        watchAction: AnimePageDeferred['watchAction'];
        watchlistState: AnimePageOverview['watchlistState'];
    };

    let { anime, artwork, audioLabel, watchAction, watchlistState }: Props = $props();
</script>

<section>
    <figure
        class="anime-hero relative z-30 grid h-[calc(100dvh-10rem)] min-h-120 max-h-192 grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:col-start-1 before:row-start-1 before:z-10 before:h-full after:pointer-events-none after:col-start-1 after:row-start-1 after:z-10 after:h-full sm:min-h-150 lg:min-h-175 lg:max-h-300"
    >
        <h1 class="sr-only">{anime.title}</h1>

        {#if artwork?.selectedBackdrop}
            <div class="absolute inset-0 overflow-hidden">
                <ProgressiveImage
                    src={artwork.selectedBackdrop.url}
                    alt={anime.title}
                    class="absolute inset-x-0 top-0 z-0 h-dvh w-full"
                    imageClass="object-[45%_0%]"
                />
            </div>
        {/if}

        <div
            class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end leading-none font-bold sm:mt-5 sm:mr-8 lg:mr-12"
        >
            <Dropdown id="more-options">
                {#snippet trigger(triggerProps)}
                    <Button
                        {...triggerProps}
                        variant="unstyled"
                        aria-label={m.anime_more()}
                        class="appearance-none px-3 py-0 transition-colors hover:bg-panel data-[state=open]:bg-panel"
                    >
                        <span class="flex min-h-11 items-center gap-3 text-sm leading-none">
                            <DotsThreeVerticalIcon size="1.5rem" weight="bold" aria-hidden="true" />
                            <span>{m.anime_more()}</span>
                        </span>
                    </Button>
                {/snippet}
                {#snippet content(menuProps)}
                    <div
                        {...menuProps}
                        role="menu"
                        aria-label={m.anime_more()}
                        class="absolute top-full right-0 z-50 w-56 bg-panel py-2"
                    >
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
                        alt=""
                        aria-hidden="true"
                        style:height={`clamp(${(5 * artwork.logoSize) / 100}rem, ${(6.4 * artwork.logoSize) / 100}vw, ${(8 * artwork.logoSize) / 100}rem)`}
                        class="max-w-[65vw] object-contain object-left sm:max-w-md lg:max-w-lg 2xl:max-w-2xl"
                    />
                {:else}
                    <p
                        aria-hidden="true"
                        class="max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl"
                    >
                        {anime.title}
                    </p>
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
                            {#if anime.scoreSource === 'Kitsu'}
                                <span>{genre}</span>
                            {:else}
                                <a
                                    class="underline underline-offset-2"
                                    href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                >
                                    {genre}
                                </a>
                            {/if}
                        {/each}
                    </span>
                {/if}
            </p>

            {#if anime.score !== null}
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
            {/if}

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
                    initialState={watchlistState ?? undefined}
                />
            </div>
        </div>
    </figure>
</section>
