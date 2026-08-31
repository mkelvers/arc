<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { BookmarkSimpleIcon } from 'phosphor-svelte';

    import { cn } from '$lib/utils';
    import { watchlist, WatchlistAuthenticationError } from '$lib/watchlist.svelte';
    import Tooltip from './ui/Tooltip.svelte';
    import { Button } from './ui/button';
    import { m } from '$lib/i18n.svelte';

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
            await watchlist.toggle(animeId, title);
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

<Tooltip text={failed ? m.player_try_again() : added ? m.remove() : m.watchlist_add()}>
    <Button
        variant="ghost"
        size="icon"
        type="button"
        class={cn(
            'grid shrink-0 place-items-center text-accent transition-[filter,transform] duration-150 hover:bg-transparent hover:text-accent hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-90 disabled:cursor-wait disabled:opacity-50',
            outlined ? 'size-10 border-2 border-accent' : 'size-9'
        )}
        aria-label={added ? m.shared_remove_watchlist({ title }) : m.shared_add_watchlist({ title })}
        aria-pressed={added}
        disabled={pending}
        onclick={toggle}
    >
        <BookmarkSimpleIcon size={iconSize} weight={added ? 'fill' : 'bold'} aria-hidden="true" />
    </Button>
</Tooltip>
