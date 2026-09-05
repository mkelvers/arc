<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { PencilSimpleIcon } from 'phosphor-svelte';

    import { watchlistStates, type WatchlistState } from '$lib/watchlist';
    import { watchlist, WatchlistAuthenticationError } from '$lib/watchlist.svelte';
    import { cn } from '$lib/utils';
    import Button from '$lib/components/ui/button/button.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        animeId: number;
        title: string;
        initialState?: WatchlistState;
    }

    let { animeId, title, initialState }: Props = $props();
    let pending = $state(false);
    let failed = $state(false);
    let seededAnimeId: number | undefined;
    const watchlistStatus = $derived(watchlist.state(animeId));
    const statusLabel = (status: WatchlistState) =>
        status === 'watching'
            ? m.watchlist_watching()
            : status === 'plan_to_watch'
              ? m.watchlist_plan()
              : status === 'completed'
                ? m.watchlist_completed()
                : m.watchlist_dropped();

    $effect(() => {
        if (initialState && seededAnimeId !== animeId) {
            seededAnimeId = animeId;
            watchlist.seed(animeId, initialState);
        }
        if (page.data.account) {
            void watchlist.load().catch(() => (failed = true));
        }
    });

    async function authenticate() {
        if (page.data.account) {
            return true;
        }

        await goto('/login');
        return false;
    }

    async function setStatus(next: WatchlistState) {
        if (pending || !(await authenticate())) {
            return;
        }

        pending = true;
        failed = false;
        try {
            await watchlist.set(animeId, next, title);
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

    async function remove() {
        if (pending || !(await authenticate())) {
            return;
        }

        pending = true;
        failed = false;
        try {
            await watchlist.remove(animeId);
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

<Dropdown
    id="watchlist-status"
    ariaLabel={m.shared_manage_title({ title })}
    menuAlign="start"
    menuClass="w-52 pt-2 max-sm:right-0 max-sm:left-auto"
    triggerClass="grid size-10 shrink-0 cursor-pointer place-items-center text-accent"
>
    {#snippet trigger()}
        <Tooltip text={m.shared_manage_watchlist()} class="size-full items-center justify-center">
            <PencilSimpleIcon size="1.65em" weight="bold" aria-hidden="true" />
        </Tooltip>
    {/snippet}

    {#snippet content()}
        <div role="menu" aria-label={m.shared_set_title({ title })}>
            {#each watchlistStates as option}
                <Button
                    variant="unstyled"
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    class={cn(
                        'flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm leading-tight font-normal whitespace-nowrap text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none disabled:cursor-wait disabled:opacity-50',
                        watchlistStatus === option.value && 'bg-panel-hover text-white'
                    )}
                    onclick={() => setStatus(option.value)}
                >
                    <span>{statusLabel(option.value)}</span>
                </Button>
            {/each}

            {#if watchlistStatus}
                <div class="mt-2 border-t border-border pt-2">
                    <Button
                        variant="unstyled"
                        type="button"
                        role="menuitem"
                        disabled={pending}
                        class="block w-full px-5 py-3 text-left text-sm leading-tight font-normal whitespace-nowrap text-status-error hover:bg-panel-hover focus:bg-panel-hover focus:outline-none disabled:cursor-wait disabled:opacity-50"
                        onclick={remove}
                    >
                        {m.watchlist_remove()}
                    </Button>
                </div>
            {/if}

            {#if failed}
                <p class="border-t border-white/10 px-4 py-3 text-xs text-status-error" role="alert">
                    {m.watchlist_update_failed()}
                </p>
            {/if}
        </div>
    {/snippet}
</Dropdown>
