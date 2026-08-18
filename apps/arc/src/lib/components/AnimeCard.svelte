<script lang="ts">
    import AnimeCardCompact from './AnimeCardCompact.svelte';
    import AnimeCardPoster from './AnimeCardPoster.svelte';
    import AnimeCardTop from './AnimeCardTop.svelte';
    import type { AnimeCardItem } from './AnimeCard.types';

    const cardVariants = {
        compact: AnimeCardCompact,
        poster: AnimeCardPoster,
        top: AnimeCardTop,
    } as const;

    interface Props {
        anime: AnimeCardItem;
        compact?: boolean;
        current?: boolean;
        onselect?: () => void;
        variant?: 'poster' | 'compact' | 'top';
    }

    let { anime, compact = false, current = false, onselect, variant = 'poster' }: Props = $props();
    const Card = $derived(cardVariants[variant]);
</script>

<Card anime={anime} compact={compact} current={current} onselect={onselect} />
