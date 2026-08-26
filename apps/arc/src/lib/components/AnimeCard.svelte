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
        meta?: string;
        compact?: boolean;
        current?: boolean;
        onselect?: () => void;
        reserveTitleSpace?: boolean;
        truncateTitle?: boolean;
        variant?: 'poster' | 'compact' | 'top';
    }

    let {
        anime,
        meta,
        compact = false,
        current = false,
        onselect,
        reserveTitleSpace = true,
        truncateTitle = true,
        variant = 'poster',
    }: Props = $props();
    const Card = $derived(cardVariants[variant]);
</script>

<Card
    anime={anime}
    meta={meta}
    compact={compact}
    current={current}
    onselect={onselect}
    reserveTitleSpace={reserveTitleSpace}
    truncateTitle={truncateTitle}
/>
