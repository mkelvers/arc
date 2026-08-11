<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { CheckIcon, PencilSimpleIcon } from 'phosphor-svelte';

    import { watchlistStatusOptions, type WatchlistState } from '$lib/watchlist';
    import { watchlist, WatchlistAuthenticationError } from '$lib/watchlist.svelte';
    import Dropdown from '$lib/components/Dropdown.svelte';

    interface Props {
        animeId: number;
        title: string;
        initialState?: WatchlistState;
    }

    let { animeId, title, initialState }: Props = $props();
    let pending = $state(false);
    let failed = $state(false);
    let seeded = false;
    const watchlistStatus = $derived(watchlist.state(animeId));

    $effect(() => {
        if (initialState && !seeded) {
            seeded = true;
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
            await watchlist.set(animeId, next);
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
    ariaLabel={`Manage ${title} watchlist status`}
    menuAlign="start"
    menuClass="w-52 pt-2"
    triggerClass="grid size-10 shrink-0 cursor-pointer place-items-center text-accent transition-opacity hover:opacity-70 peer-focus-visible:opacity-70"
>
    {#snippet trigger()}
        <PencilSimpleIcon size="1.65em" weight="regular" aria-hidden="true" />
    {/snippet}

    {#snippet content()}
        <div role="menu" aria-label={`Set ${title} watchlist status`}>
            {#each watchlistStatusOptions as option}
                <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    class:bg-panel-hover={watchlistStatus === option.value}
                    class:text-foreground={watchlistStatus === option.value}
                    class="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm leading-tight font-normal whitespace-nowrap text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none disabled:cursor-wait disabled:opacity-50"
                    onclick={() => setStatus(option.value)}
                >
                    <span>{option.label}</span>
                    {#if watchlistStatus === option.value}
                        <CheckIcon size="1rem" weight="bold" aria-hidden="true" />
                    {/if}
                </button>
            {/each}

            {#if watchlistStatus}
                <div class="mt-2 border-t border-border pt-2">
                    <button
                        type="button"
                        role="menuitem"
                        disabled={pending}
                        class="block w-full px-5 py-3 text-left text-sm leading-tight font-normal whitespace-nowrap text-status-error hover:bg-panel-hover focus:bg-panel-hover focus:outline-none disabled:cursor-wait disabled:opacity-50"
                        onclick={remove}
                    >
                        Remove from watchlist
                    </button>
                </div>
            {/if}

            {#if failed}
                <p
                    class="border-t border-white/10 px-4 py-3 text-xs text-status-error"
                    role="alert"
                >
                    Watchlist could not be updated. Try again.
                </p>
            {/if}
        </div>
    {/snippet}
</Dropdown>
