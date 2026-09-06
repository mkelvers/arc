<script lang="ts">
    import { goto } from '$app/navigation';
    import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
    import { CaretDownIcon, DotsThreeVerticalIcon, PlayIcon } from 'phosphor-svelte';
    import { NotificationsResponseSchema, type Notification } from '@arc/core/client';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import errorArtwork from '$lib/assets/error-state.png';
    import emptyArtwork from '$lib/assets/notifications-empty.png';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let notifications = $state<Notification[] | null>(null);
    let notificationView = $state<'unread' | 'read'>('unread');
    let selectedNotifications = $derived(
        (notifications ?? []).filter(({ readAt }) => (notificationView === 'read' ? !!readAt : !readAt))
    );
    let failed = $state(false);

    function formatEpisodeNumbers(numbers: readonly number[]) {
        const ranges: string[] = [];
        let start = numbers[0]!;
        let end = start;

        for (const number of numbers.slice(1)) {
            if (number === end + 1) {
                end = number;
                continue;
            }
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = number;
            end = number;
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    }

    async function openNotification(entry: Notification) {
        if (!entry.readAt) {
            await Promise.all(
                [entry.id, ...(entry.relatedIds ?? [])].map((id) =>
                    fetch(`/v1/notifications/${id}/read`, { method: 'POST' })
                )
            );
        }
        await goto(entry.href);
    }

    async function markNotificationAsRead(entry: Notification) {
        const ids = [entry.id, ...(entry.relatedIds ?? [])];
        await Promise.all(ids.map((id) => fetch(`/v1/notifications/${id}/read`, { method: 'POST' })));
        const readAt = new Date().toISOString();
        notifications =
            notifications?.map((notification) =>
                ids.includes(notification.id) ? { ...notification, readAt } : notification
            ) ?? [];
    }

    $effect(() => {
        void data.notifications
            .then((result) => {
                notifications = result.entries;
            })
            .catch(() => (failed = true));
    });
</script>

{#snippet notificationCard(entry: Notification)}
    <div
        class="group relative grid w-full gap-5 text-left transition-colors hover:bg-surface focus-within:bg-surface sm:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] sm:gap-8"
    >
        <Button
            variant="unstyled"
            type="button"
            class="grid h-auto w-full gap-5 text-left whitespace-normal sm:col-span-2 sm:grid-cols-subgrid sm:gap-8"
            onclick={() => openNotification(entry)}
        >
            <div class="relative aspect-4/3 overflow-hidden bg-panel">
                {#if entry.imageUrl}
                    <img src={entry.imageUrl} alt="" class="size-full object-cover" />
                {:else}
                    <div class="grid size-full place-items-center text-muted">
                        <PlayIcon size={24} aria-hidden="true" />
                    </div>
                {/if}
                {#if !entry.readAt}
                    <span class="absolute top-2 right-2 size-2 rounded-full bg-accent" aria-label="Unread"></span>
                {/if}
            </div>
            <div class="min-w-0 self-start py-5">
                <p class="text-base font-semibold text-foreground sm:text-lg">{entry.title}</p>
                <p class="mt-2 text-sm leading-6 text-muted sm:text-base">
                    {entry.type === 'dub_available'
                        ? entry.dubEpisodeNumbers.length === 1
                            ? `The dubbed version of episode ${formatEpisodeNumbers(entry.episodeNumbers)} is now available to watch.`
                            : `The dubbed versions of episodes ${formatEpisodeNumbers(entry.episodeNumbers)} are now available to watch.`
                        : entry.dubEpisodeNumbers.length
                          ? entry.episodeNumbers.length === 1 && entry.dubEpisodeNumbers.length === 1
                              ? `Episode ${formatEpisodeNumbers(entry.episodeNumbers)} has just aired and is now available to watch, and its dubbed version is available too.`
                              : `Episodes ${formatEpisodeNumbers(entry.episodeNumbers)} are now available to watch, including dubbed versions of episodes ${formatEpisodeNumbers(entry.dubEpisodeNumbers)}.`
                          : entry.episodeNumbers.length === 1
                            ? `Episode ${formatEpisodeNumbers(entry.episodeNumbers)} aired and is now available to watch.`
                            : `Episodes ${formatEpisodeNumbers(entry.episodeNumbers)} are now available to watch.`}
                </p>
                <span
                    class="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase"
                >
                    Watch now
                    <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                </span>
            </div>
        </Button>
        {#if !entry.readAt}
            <div
                class="absolute right-3 bottom-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            >
                <Dropdown
                    id={`notification-${entry.id}-options`}
                    menuClass="w-48"
                    triggerClass="flex size-10 items-center justify-center text-muted transition-colors hover:text-foreground data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <DotsThreeVerticalIcon size="1.25rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label="Notification options" class="bg-panel py-2">
                            <Button
                                variant="unstyled"
                                type="button"
                                role="menuitem"
                                data-dropdown-close
                                class="block w-full px-5 py-3 text-left text-sm leading-tight font-normal text-muted whitespace-nowrap hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => markNotificationAsRead(entry)}
                            >
                                Mark as read
                            </Button>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        {/if}
    </div>
{/snippet}

<svelte:head>
    <title>Arc — Notifications</title>
</svelte:head>

{#if failed}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
        <div class="mx-auto w-full max-w-7xl px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <h1 class="text-center text-2xl font-semibold sm:text-3xl">Notification Center</h1>
            <EmptyState
                id="notifications-error"
                artwork={errorArtwork}
                artworkWidth={1254}
                artworkHeight={1254}
                title="Notifications unavailable"
                body="Arc couldn't load your notifications right now. Try again."
            >
                {#snippet action()}
                    <a
                        href="/notifications"
                        class="inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
                    >
                        Try again
                    </a>
                {/snippet}
            </EmptyState>
        </div>
    </main>
{:else if notifications === null}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground" aria-busy="true">
        <div class="mx-auto w-full max-w-7xl px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <div class="mx-auto h-8 w-56 animate-pulse bg-panel" aria-hidden="true"></div>
            <div class="mt-14 h-5 w-40 animate-pulse bg-panel" aria-hidden="true"></div>
            <div class="mt-5 h-px bg-border" aria-hidden="true"></div>
        </div>
    </main>
{:else}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
        <div class="mx-auto w-full max-w-7xl px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <h1 class="text-center text-2xl font-semibold sm:text-3xl">Notification Center</h1>

            <section class="mt-12" aria-labelledby="notification-view-label">
                <div class="border-b border-border pb-4">
                    <Dropdown
                        id="notification-view"
                        menuAlign="start"
                        menuClass="mt-2 w-56 shadow-xl"
                        triggerClass="flex h-10 cursor-pointer items-center gap-2 text-lg font-semibold transition-colors hover:text-muted data-[state=open]:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        {#snippet trigger()}
                            <CaretDownIcon size="1rem" weight="bold" aria-hidden="true" />
                            <span id="notification-view-label">
                                {notificationView === 'read' ? 'Read Notifications' : 'Past Notifications'}
                            </span>
                        {/snippet}
                        {#snippet content()}
                            <div role="menu" aria-label="Notification view" class="bg-panel py-2">
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={notificationView === 'unread'}
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => (notificationView = 'unread')}
                                >
                                    Past Notifications
                                </Button>
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={notificationView === 'read'}
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => (notificationView = 'read')}
                                >
                                    Read Notifications
                                </Button>
                            </div>
                        {/snippet}
                    </Dropdown>
                </div>

                {#if !selectedNotifications.length}
                    <EmptyState
                        id={`notifications-${notificationView}-empty`}
                        artwork={emptyArtwork}
                        artworkWidth={1254}
                        artworkHeight={1254}
                        title={notificationView === 'read' ? 'No read notifications' : 'You’re all caught up'}
                        body={notificationView === 'read'
                            ? 'Notifications you have read will appear here.'
                            : 'New episodes and dub releases from your watchlist will appear here.'}
                    />
                {:else}
                    <div class="mt-6 space-y-6">
                        {#each selectedNotifications as entry (entry.id)}
                            {@render notificationCard(entry)}
                        {/each}
                    </div>
                {/if}
            </section>
        </div>
    </main>
{/if}
