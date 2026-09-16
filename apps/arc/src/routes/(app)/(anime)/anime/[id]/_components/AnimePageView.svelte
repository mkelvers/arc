<script lang="ts">
    import { untrack } from 'svelte';
    import { type AnimePageEpisodeUpdates } from '@arc/core/client';

    import AnimeDetails from './AnimeDetails.svelte';
    import AnimeEpisodeList from './AnimeEpisodeList.svelte';
    import AnimeHero from './AnimeHero.svelte';
    import FranchiseOrder from './FranchiseOrder.svelte';
    import type { PageData } from '../$types';

    type PageResult = Awaited<PageData['page']>;
    type Props = { data: Extract<PageResult, { status: 'success' }>['data'] };
    type EpisodeUpdate = Pick<AnimePageEpisodeUpdates, 'watchAction' | 'audioLabel'>;

    let { data }: Props = $props();
    const initialData = untrack(() => data);
    let watchAction = $state(initialData.watchAction);
    let audioLabel = $state(initialData.audioLabel);

    function updateHero(update: EpisodeUpdate) {
        watchAction = update.watchAction;
        audioLabel = update.audioLabel;
    }
</script>

<main class="bg-canvas text-foreground">
    <AnimeHero
        anime={data.anime}
        artwork={data.artwork}
        audioLabel={audioLabel}
        watchAction={watchAction}
        watchlistState={data.watchlistState}
    />
    <AnimeDetails anime={data.anime} />

    <div class="px-3 sm:px-8 lg:px-14">
        <AnimeEpisodeList
            anime={data.anime}
            artwork={data.artwork}
            initialEpisodes={data.episodes}
            initialEpisodeRevision={data.episodeRevision}
            initialInventory={data.episodeInventory}
            onupdate={updateHero}
        />

        {#if data.franchise?.entries.length}
            <FranchiseOrder order={data.franchise} currentAnimeId={data.anime.id} />
        {/if}
    </div>
</main>
