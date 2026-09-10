<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { untrack } from 'svelte';

    import {
        AnimePageEpisodeUpdatesSchema,
        type AnimePageDeferred,
        type AnimePageEpisodeUpdates,
    } from '@arc/core/client';

    type Props = {
        animeId: number;
        animeStatus: AnimePageDeferred['anime']['status'];
        episodes: AnimePageDeferred['episodes'];
        episodeInventoryStatus: AnimePageDeferred['episodeInventory']['status'];
        episodeRevision: string | null;
        onupdate: (update: AnimePageEpisodeUpdates) => boolean;
    };

    let { animeId, animeStatus, episodes, episodeInventoryStatus, episodeRevision, onupdate }: Props = $props();

    $effect(() => {
        const shouldPoll = untrack(() => episodeInventoryStatus === 'pending' || animeStatus === 'RELEASING');
        if (!shouldPoll) {
            return;
        }

        const controller = new AbortController();
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        let warned = false;

        const poll = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const current = untrack(() => ({
                        episodeIds: episodes.map(({ id }) => id),
                        revision: episodeRevision,
                    }));
                    const query = new URLSearchParams({
                        known: current.episodeIds.join(','),
                    });
                    if (current.revision) {
                        query.set('revision', current.revision);
                    }

                    const response = await fetch(`/v1/anime/${animeId}/episodes/updates?${query}`, {
                        cache: 'no-store',
                        signal: controller.signal,
                    });
                    if (!response.ok) {
                        throw new Error(`Episode update request failed with ${response.status}`);
                    }

                    const result = AnimePageEpisodeUpdatesSchema.parse(await response.json());
                    if (stopped) {
                        return;
                    }

                    warned = false;
                    if (onupdate(result)) {
                        await invalidate(`arc:anime:${animeId}:overview`);
                    }
                } catch (cause) {
                    if (!controller.signal.aborted && !warned) {
                        warned = true;
                        console.warn(`Episode update check failed for AniList ${animeId}`, cause);
                    }
                }
            }

            if (!stopped && (episodeInventoryStatus === 'pending' || animeStatus === 'RELEASING')) {
                timer = setTimeout(poll, 60_000);
            }
        };

        timer = setTimeout(
            poll,
            untrack(() => (episodeInventoryStatus === 'pending' ? 2_000 : 60_000))
        );

        return () => {
            stopped = true;
            controller.abort();
            clearTimeout(timer);
        };
    });
</script>
