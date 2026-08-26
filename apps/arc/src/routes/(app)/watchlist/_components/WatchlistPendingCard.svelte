<script lang="ts">
    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import { m } from '$lib/paraglide/messages.js';

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
            <div class="size-full animate-pulse bg-surface motion-reduce:animate-none" aria-hidden="true"></div>
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
