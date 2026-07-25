<script lang="ts">
    import Dropdown from '$lib/components/Dropdown.svelte';
    import EpisodeList from '$lib/components/EpisodeList.svelte';
    import { enhance } from '$app/forms';
    import type { PageProps } from './$types';
    import {
        CaretDownIcon,
        BookmarkSimpleIcon,
        DotsThreeVerticalIcon,
        PlayIcon,
        ShareNetworkIcon,
    } from 'phosphor-svelte';

    let { data }: PageProps = $props();

    const backdrop = $derived(data.artwork.selectedBackdrop);
    const logo = $derived(data.artwork.selectedLogo);
    let detailsExpanded = $state(false);

    async function share() {
        const shareData = { title: data.anime.title, url: window.location.href };

        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.url);
        }
    }
</script>

<svelte:head><title>{data.anime.title} — Arc</title></svelte:head>

<main class="bg-canvas text-foreground">
    <section class="min-h-dvh">
        <figure
            class="anime-hero grid h-[68dvh] min-h-120 max-h-[48rem] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-canvas before:pointer-events-none before:col-start-1 before:row-start-1 before:z-10 before:h-full after:pointer-events-none after:col-start-1 after:row-start-1 after:z-10 after:h-full sm:min-h-150 lg:h-[72dvh] 2xl:max-h-[50rem]"
        >
            {#if backdrop}
                <img
                    src={backdrop.url}
                    alt={data.anime.title}
                    class="col-start-1 row-start-1 size-full object-cover object-center sm:object-[center_0%]"
                />
            {/if}

            <div class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end font-bold sm:mt-5 sm:mr-8 lg:mr-12">
                <Dropdown
                    id="more-options"
                    items={[
                        { label: 'View Media Options', href: `/anime/${data.anime.id}/media` }
                    ]}
                >
                    {#snippet trigger()}
                        <span class="flex min-h-11 items-center gap-3 text-sm leading-none">
                            <DotsThreeVerticalIcon size="1.5rem" weight="bold" aria-hidden="true" />
                            <span>MORE</span>
                        </span>
                    {/snippet}
                </Dropdown>
            </div>

            <div
                class={`z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-[clamp(2.5rem,3.9vw,5rem)] ${logo
                    ? ''
                    : 'pt-76 sm:pt-92 lg:pt-104'}`}
            >
                <div class="w-fit">
                    {#if logo}
                        <img
                            src={logo.url}
                            alt={data.anime.title}
                            style:height={`clamp(${5 * data.artwork.logoSize / 100}rem, ${5.7 * data.artwork.logoSize / 100}vw, ${6.25 * data.artwork.logoSize / 100}rem)`}
                            class="max-h-24 max-w-[min(100%,28rem)] object-contain object-left sm:max-h-32 lg:max-h-none lg:max-w-none"
                        />
                    {:else if !data.artwork.logoHidden}
                        <h1 class="max-w-3xl text-4xl leading-none font-bold sm:text-6xl lg:text-[clamp(3rem,5.7vw,6.25rem)]">
                            {data.anime.title}
                        </h1>
                    {/if}
                </div>

                <p class="mt-8 text-sm text-muted sm:mt-10 lg:mt-[clamp(2rem,2.54vw,2.75rem)] lg:text-[clamp(0.875rem,0.88vw,1rem)]">
                    <span class="font-normal after:mx-1 after:content-['•']">{data.anime.format}</span>
                    {#each data.anime.genres as genre, index}
                        <a class="underline underline-offset-2" href="/">{genre}</a>{index < data.anime.genres.length - 1 ? ', ' : ''}
                    {/each}
                </p>

                <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:text-base lg:mt-[clamp(0.625rem,0.78vw,0.875rem)] lg:gap-[clamp(0.5rem,0.58vw,0.625rem)] lg:text-[clamp(0.875rem,0.98vw,1.0625rem)]">
                    <span class="flex items-center gap-0.5 text-muted" aria-label="5 out of 5 stars">
                        {#each Array(5) as _}
                            <svg class="size-[1.55em] fill-current sm:size-[1.85em]" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m12 2 2.85 6.59L22 9.27 16.55 14l1.63 7L12 17.27 5.82 21l1.63-7L2 9.27l7.15-.68z" />
                            </svg>
                        {/each}
                    </span>
                    <span class="h-[1.7em] border-l border-border-strong max-[22rem]:hidden"></span>
                    <strong>AniList score: {data.anime.score}%</strong>
                    <CaretDownIcon size="0.9em" weight="fill" aria-hidden="true" />
                </div>

                <div class="mt-7 flex items-center gap-2 text-xs font-bold text-accent sm:text-sm lg:mt-[clamp(1.875rem,1.95vw,2.125rem)] lg:gap-[clamp(0.5rem,0.58vw,0.625rem)] lg:text-[clamp(0.75rem,0.78vw,0.875rem)]">
                    <a
                        href={data.episodes[0]?.href ?? '#anime-episode-list'}
                        class="flex min-h-11 items-center gap-2.5 bg-accent px-4 text-on-accent sm:px-6 lg:h-[clamp(2.625rem,2.73vw,3rem)] lg:px-[clamp(1rem,1.36vw,1.375rem)]"
                    >
                        <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                        START WATCHING E1
                    </a>
                    <form method="POST" action="?/watchlist" use:enhance>
                        <button
                            type="submit"
                            class:bg-accent={data.watchlistState === 'plan_to_watch'}
                            class:text-on-accent={data.watchlistState === 'plan_to_watch'}
                            class="grid size-11 shrink-0 place-items-center border border-accent transition-colors hover:bg-accent hover:text-on-accent lg:size-[clamp(2.625rem,2.73vw,3rem)]"
                            aria-label={data.watchlistState === 'plan_to_watch' ? 'Remove from Plan to Watch' : 'Add to Plan to Watch'}
                            aria-pressed={data.watchlistState === 'plan_to_watch'}
                            title={data.watchlistState === 'plan_to_watch' ? 'Remove from Plan to Watch' : 'Add to Plan to Watch'}
                        >
                            <BookmarkSimpleIcon
                                size="1.65em"
                                weight={data.watchlistState === 'plan_to_watch' ? 'fill' : 'regular'}
                                aria-hidden="true"
                            />
                        </button>
                    </form>
                    <button
                        type="button"
                        class="grid size-11 shrink-0 place-items-center transition-colors hover:bg-accent hover:text-on-accent lg:size-[clamp(2.625rem,2.73vw,3rem)]"
                        aria-label="Share"
                        title="Share"
                        onclick={share}
                    >
                        <ShareNetworkIcon size="1.65em" weight="regular" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </figure>

        <div class="px-5 pt-7 sm:px-10 lg:px-16 lg:pt-8">
            <section
                id="anime-details"
                class={`grid min-w-0 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-12 lg:gap-[clamp(4rem,10.75vw,13.75rem)] lg:text-[clamp(0.8125rem,0.73vw,0.9375rem)] lg:leading-[clamp(1.2rem,1.22vw,1.5625rem)] ${detailsExpanded ? 'max-h-320' : 'max-h-24 mask-[linear-gradient(to_bottom,black_45%,transparent_100%)]'}`}
            >
                <p class="max-w-prose text-foreground md:max-w-[96%]">{data.anime.description}</p>
                <div class="space-y-[clamp(0.5rem,0.58vw,0.75rem)]">
                    <p><strong class="font-normal text-foreground">Production:</strong> {data.anime.studios.join(', ')}</p>
                    <p><strong class="font-normal text-foreground">Key staff:</strong> {data.anime.staff}</p>
                    <p><strong class="font-normal text-foreground">Rankings:</strong> {data.anime.rankings.join(', ')}</p>
                    <p><strong class="font-normal text-foreground">Audience:</strong> {data.anime.members} members, {data.anime.favourites} favorites</p>
                    <p><strong class="font-normal text-foreground">Themes:</strong> {data.anime.themes.join(', ')}</p>
                    <p>
                        <strong class="font-normal text-foreground">Genres:</strong>
                        {#each data.anime.genres as genre, index}
                            <a class="underline underline-offset-2" href="/">{genre}</a>{index < data.anime.genres.length - 1 ? ', ' : ''}
                        {/each}
                    </p>
                </div>
            </section>

            <button
                type="button"
                class="min-h-11 text-[0.6875rem] font-semibold text-accent sm:text-xs"
                aria-expanded={detailsExpanded}
                aria-controls="anime-details"
                onclick={() => (detailsExpanded = !detailsExpanded)}
            >
                {detailsExpanded ? 'FEWER DETAILS' : 'MORE DETAILS'}
            </button>
            <div class="border-b border-border"></div>
        </div>
    </section>

    <div class="px-5 sm:px-10 lg:px-16">
        <EpisodeList
            episodes={data.episodes}
            title={data.anime.title}
            image={backdrop?.url}
        />
    </div>
</main>
