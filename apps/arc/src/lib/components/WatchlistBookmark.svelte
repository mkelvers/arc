<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { BookmarkSimpleIcon } from 'phosphor-svelte';

    import { cn } from '$lib/utils';
    import { watchlist, WatchlistAuthenticationError } from '$lib/watchlist.svelte';
    import Tooltip from './Tooltip.svelte';

    interface Props {
        animeId: number;
        title: string;
        iconSize?: string;
        outlined?: boolean;
    }

    let { animeId, title, iconSize = '1.55rem', outlined = false }: Props = $props();
    let pending = $state(false);
    let failed = $state(false);
    const added = $derived(watchlist.state(animeId) !== null);

    $effect(() => {
        if (!page.data.account) {
            return;
        }

        void watchlist.load().catch((cause) => {
            if (!(cause instanceof WatchlistAuthenticationError)) {
                failed = true;
            }
        });
    });

    async function toggle() {
        if (!page.data.account) {
            await goto('/login');
            return;
        }
        if (pending) {
            return;
        }

        pending = true;
        failed = false;
        try {
            await watchlist.toggle(animeId);
        } catch (cause) {
            if (cause instanceof WatchlistAuthenticationError) {
                await goto('/login');
            } else {
                failed = true;
            }
        } finally {
            pending = false;
        }
    }
</script>

<Tooltip text={failed ? 'Try again' : added ? 'Remove from Watchlist' : 'Add to Watchlist'}>
    <button
        type="button"
        class={cn(
            'grid shrink-0 place-items-center text-accent transition-opacity disabled:cursor-wait disabled:opacity-50',
            outlined ? 'size-10 border-2 border-accent' : 'size-9'
        )}
        aria-label={added ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
        aria-pressed={added}
        disabled={pending}
        onclick={toggle}
    >
        <BookmarkSimpleIcon size={iconSize} weight={added ? 'fill' : 'bold'} aria-hidden="true" />
    </button>
</Tooltip>
