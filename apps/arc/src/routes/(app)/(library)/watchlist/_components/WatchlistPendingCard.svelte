<script lang="ts">
    import { Card, CardMedia } from '$lib/components/ui/card';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        anime: {
            id: number;
            href: string;
            title: string;
        };
    }

    let { anime }: Props = $props();
</script>

<Card>
    <a href={anime.href} class="block focus-visible:outline-none">
        <CardMedia aspect="poster">
            <Skeleton class="size-full rounded-none" />
            <span class="sr-only">{m.watchlist_artwork_loading()}</span>
        </CardMedia>
        <h3 class="mt-3 min-h-10 line-clamp-2 text-sm leading-snug font-semibold">
            {anime.title}
        </h3>
    </a>
    <div class="mt-1.5 flex items-center justify-between gap-2 text-sm text-muted">
        <span>{m.watchlist_metadata_pending()}</span>
        <WatchlistBookmark animeId={anime.id} title={anime.title} />
    </div>
</Card>
