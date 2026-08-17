<script lang="ts">
    import type { AnimeEpisode } from '$lib/anime/types';
    import Modal from './Modal.svelte';
    import EpisodeGridCard from './EpisodeGridCard.svelte';

    interface Props {
        open: boolean;
        title: string;
        episodes: AnimeEpisode[];
        currentId: string;
        image?: string | null;
        onclose: () => void;
    }

    let { open, title, episodes, currentId, image = null, onclose }: Props = $props();
</script>

<Modal id="episode-dialog" open={open} wide title={title} onclose={onclose}>
    {#snippet children()}
        <div class="max-h-[calc(100vh-5rem)] overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
            <div class="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {#each episodes as episode}
                    <EpisodeGridCard
                        episode={episode}
                        title={title}
                        image={image}
                        current={episode.id === currentId}
                        context="dialog"
                    />
                {/each}
            </div>
        </div>
    {/snippet}
</Modal>
