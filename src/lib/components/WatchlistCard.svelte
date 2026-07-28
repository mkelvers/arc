<script lang="ts">
    import { enhance } from '$app/forms';
    import { XIcon } from 'phosphor-svelte';

    interface Props {
        animeId: number;
        href: string;
        image: string;
        title: string;
    }

    let { animeId, href, image, title }: Props = $props();
</script>

<article class="group relative min-w-0">
    <a
        {href}
        class="block focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-accent"
        aria-label={`View ${title}`}
    >
        <div class="aspect-2/3 overflow-hidden bg-surface">
            <img
                src={image}
                alt=""
                class="size-full object-cover transition-opacity group-hover:opacity-85"
                loading="lazy"
            />
        </div>
        <h2 class="mt-3 line-clamp-2 text-sm leading-snug font-semibold transition-colors group-hover:text-accent">
            {title}
        </h2>
    </a>

    <form
        method="POST"
        action="?/remove"
        use:enhance
        class="absolute top-2 right-2 z-10"
    >
        <input type="hidden" name="animeId" value={animeId} />
        <button
            type="submit"
            class="grid size-9 place-items-center bg-black/75 text-white backdrop-blur-sm transition-colors hover:bg-status-error hover:text-on-status focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`Remove ${title} from watchlist`}
            title="Remove from watchlist"
        >
            <XIcon size="1rem" weight="bold" aria-hidden="true" />
        </button>
    </form>
</article>
