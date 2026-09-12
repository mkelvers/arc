<script lang="ts">
    import { untrack } from 'svelte';
    import { MediaQuery } from 'svelte/reactivity';

    import {
        type AnimeArtwork,
        type AnimePageDeferred,
        type AnimePageOverview,
        type AnimePageEpisodeUpdates,
    } from '@arc/core/client';
    import Button from '$lib/components/ui/button/button.svelte';
    import EpisodeGridCard from '$lib/components/EpisodeGridCard.svelte';
    import EpisodeInventoryPoller from './EpisodeInventoryPoller.svelte';
    import EpisodeInventoryStatus from './EpisodeInventoryStatus.svelte';
    import { m } from '$lib/i18n.svelte';

    type EpisodeUpdate = Pick<AnimePageEpisodeUpdates, 'watchAction' | 'audioLabel'>;
    type Props = {
        anime: AnimePageDeferred['anime'];
        artwork: AnimeArtwork;
        initialEpisodes: AnimePageDeferred['episodes'];
        initialEpisodeRevision: AnimePageOverview['episodeRevision'];
        initialInventory: AnimePageDeferred['episodeInventory'];
        onupdate: (update: EpisodeUpdate) => void;
    };

    let { anime, artwork, initialEpisodes, initialEpisodeRevision, initialInventory, onupdate }: Props = $props();
    const initialData = untrack(() => ({
        episodes: initialEpisodes,
        episodeRevision: initialEpisodeRevision,
        episodeInventory: initialInventory,
    }));

    let episodes = $state(initialData.episodes);
    let episodeRevision = $state(initialData.episodeRevision);
    let episodeInventory = $state(initialData.episodeInventory);
    let retrying = $state(false);

    const fiveColumnGrid = new MediaQuery('min-width: 48rem');
    const sevenColumnGrid = new MediaQuery('min-width: 120rem');
    const pageSize = $derived(sevenColumnGrid.current ? 28 : fiveColumnGrid.current ? 25 : 20);
    let visibleEpisodeCount = $state(sevenColumnGrid.current ? 28 : fiveColumnGrid.current ? 25 : 20);

    async function retry() {
        retrying = true;
        try {
            const response = await fetch(`/v1/anime/${anime.id}/episodes/retry`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Episode inventory retry failed with ${response.status}`);
            }
            window.location.reload();
        } catch (cause) {
            console.warn(`Episode inventory retry failed for AniList ${anime.id}`, cause);
            retrying = false;
        }
    }

    function applyUpdate(result: AnimePageEpisodeUpdates) {
        episodeInventory = result.episodeInventory;

        if (result.revision !== episodeRevision) {
            episodes = result.replace
                ? result.episodes
                : [...episodes, ...result.episodes].toSorted((left, right) => left.number - right.number);
            episodeRevision = result.revision;
            onupdate(result);
            return true;
        }

        return false;
    }
</script>

<EpisodeInventoryPoller
    animeId={anime.id}
    animeStatus={anime.status}
    episodes={episodes}
    episodeInventoryStatus={episodeInventory.status}
    episodeRevision={episodeRevision}
    onupdate={applyUpdate}
></EpisodeInventoryPoller>

<section id="anime-episode-list" class="px-2 py-7 sm:pb-12 lg:pb-16" aria-labelledby="anime-episodes-title">
    <h2 id="anime-episodes-title" class="sr-only">{m.player_episodes()}</h2>
    {#if episodes.length}
        <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 hero:grid-cols-7">
            {#each episodes.slice(0, visibleEpisodeCount) as episode}
                <EpisodeGridCard
                    episode={episode}
                    title={anime.title}
                    image={artwork?.selectedBackdrop?.url ?? null}
                ></EpisodeGridCard>
            {/each}
        </div>
        {#if visibleEpisodeCount < episodes.length}
            <Button
                variant="unstyled"
                type="button"
                class="mx-auto mt-8 flex min-h-11 w-full max-w-5xl items-center justify-center bg-episode-action px-5 text-xs font-bold uppercase hover:bg-episode-action-hover"
                onclick={() => (visibleEpisodeCount = Math.min(episodes.length, visibleEpisodeCount + pageSize))}
            >
                {m.anime_show_more_episodes()}
            </Button>
        {/if}
    {:else if episodeInventory.status === 'failed'}
        <EpisodeInventoryStatus retrying={retrying} onretry={retry}></EpisodeInventoryStatus>
    {/if}
</section>
