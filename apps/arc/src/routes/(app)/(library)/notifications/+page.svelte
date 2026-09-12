<script lang="ts">
    import { goto } from '$app/navigation';
    import { CaretDownIcon } from 'phosphor-svelte';
    import { NotificationsResponseSchema, type Notification } from '@arc/core/client';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import NotificationCard from '$lib/components/ui/snippets/NotificationCard.svelte';
    import errorArtwork from '$lib/assets/error-state.webp';
    import emptyArtwork from '$lib/assets/notifications-empty.webp';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let notifications = $state<Notification[] | null>(null);
    let notificationView = $state<'unread' | 'read'>('unread');
    let selectedNotifications = $derived(
        (notifications ?? []).filter(({ readAt }) => (notificationView === 'read' ? !!readAt : !readAt))
    );
    let failed = $state(false);

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
                if (!result) {
                    failed = true;
                    return;
                }
                notifications = result.entries;
            })
            .catch(() => (failed = true));
    });
</script>

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
                    <Dropdown id="notification-view">
                        {#snippet trigger(triggerProps)}
                            <Button
                                {...triggerProps}
                                variant="unstyled"
                                aria-labelledby="notification-view-label"
                                class="appearance-none p-0 flex h-10 cursor-pointer items-center gap-2 text-lg font-semibold transition-colors hover:text-muted data-[state=open]:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                <CaretDownIcon size="1rem" weight="bold" aria-hidden="true"></CaretDownIcon>
                                <span id="notification-view-label">
                                    {notificationView === 'read' ? 'Read Notifications' : 'Past Notifications'}
                                </span>
                            </Button>
                        {/snippet}
                        {#snippet content(menuProps)}
                            <div
                                {...menuProps}
                                role="menu"
                                aria-label="Notification view"
                                class="absolute top-full left-0 z-50 mt-2 w-56 bg-panel py-2 shadow-xl"
                            >
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
                    ></EmptyState>
                {:else}
                    <div class="mt-6 space-y-6">
                        {#each selectedNotifications as entry (entry.id)}
                            <NotificationCard
                                entry={entry}
                                onOpen={openNotification}
                                onMarkAsRead={markNotificationAsRead}
                            ></NotificationCard>
                        {/each}
                    </div>
                {/if}
            </section>
        </div>
    </main>
{/if}
