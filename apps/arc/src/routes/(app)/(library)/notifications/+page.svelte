<script lang="ts">
    import { goto } from '$app/navigation';
    import { BellIcon, CheckIcon, PlayIcon } from 'phosphor-svelte';
    import { NotificationsResponseSchema, type Notification } from '@arc/api-contract/notifications';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import errorArtwork from '$lib/assets/error-state.png';
    import emptyArtwork from '$lib/assets/notifications-empty.png';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let notifications = $state<Notification[] | null>(null);
    let unreadCount = $state(0);
    let failed = $state(false);

    async function markAllRead() {
        await fetch('/v1/notifications/read-all', { method: 'POST' });
        notifications = notifications?.map((entry) => ({ ...entry, readAt: new Date().toISOString() })) ?? [];
        unreadCount = 0;
    }

    async function openNotification(entry: Notification) {
        if (!entry.readAt) {
            await fetch(`/v1/notifications/${entry.id}/read`, { method: 'POST' });
        }
        await goto(entry.href);
    }

    $effect(() => {
        void data.notifications
            .then((result) => {
                notifications = result.entries;
                unreadCount = result.unreadCount;
            })
            .catch(() => (failed = true));
    });
</script>

<svelte:head>
    <title>Arc — Notifications</title>
</svelte:head>

{#if failed}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
        <div class="mx-auto w-full max-w-264 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <h1 class="text-2xl font-semibold">Notification Center</h1>
            <EmptyState
                id="notifications-error"
                artwork={errorArtwork}
                artworkWidth={1254}
                artworkHeight={1254}
                title="Notifications unavailable"
                body="Arc couldn't load your notifications right now. Try again."
                actionLabel="Try again"
                actionHref="/notifications"
            />
        </div>
    </main>
{:else if notifications === null}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground" aria-busy="true">
        <div class="mx-auto w-full max-w-264 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <div class="mx-auto h-8 w-56 animate-pulse bg-panel" aria-hidden="true"></div>
            <div class="mt-14 h-5 w-40 animate-pulse bg-panel" aria-hidden="true"></div>
            <div class="mt-5 h-px bg-border" aria-hidden="true"></div>
        </div>
    </main>
{:else}
    <main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
        <div class="mx-auto w-full max-w-264 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <h1 class="col-start-2 text-center text-2xl font-semibold sm:text-3xl">Notification Center</h1>
                {#if unreadCount > 0}
                    <button
                        type="button"
                        class="col-start-3 justify-self-end text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
                        onclick={markAllRead}
                    >
                        <CheckIcon size={17} aria-hidden="true" />
                        Mark all as read
                    </button>
                {/if}
            </div>

            <section class="mt-12" aria-labelledby="past-notifications-title">
                <div class="flex items-end justify-between gap-4 border-b border-border pb-4">
                    <h2 id="past-notifications-title" class="text-lg font-semibold">Past Notifications</h2>
                    <BellIcon size={21} class="text-muted" aria-hidden="true" />
                </div>

                {#if !notifications.length}
                    <EmptyState
                        id="notifications-empty"
                        artwork={emptyArtwork}
                        artworkWidth={1254}
                        artworkHeight={1254}
                        title="You’re all caught up"
                        body="New episodes and dub releases from your watchlist will appear here."
                    />
                {:else}
                    <div class="divide-y divide-border">
                        {#each notifications as entry (entry.id)}
                            <button
                                type="button"
                                class="group grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-4 py-6 text-left sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7 {entry.readAt
                                    ? 'opacity-70'
                                    : ''}"
                                onclick={() => openNotification(entry)}
                            >
                                <div class="relative aspect-video overflow-hidden bg-panel">
                                    {#if entry.imageUrl}
                                        <img
                                            src={entry.imageUrl}
                                            alt=""
                                            class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    {:else}
                                        <div class="grid size-full place-items-center text-muted">
                                            <PlayIcon size={24} aria-hidden="true" />
                                        </div>
                                    {/if}
                                    {#if !entry.readAt}<span
                                            class="absolute top-2 right-2 size-2 rounded-full bg-accent"
                                            aria-label="Unread"
                                        ></span>{/if}
                                </div>
                                <div class="min-w-0 self-center">
                                    <p class="text-base font-semibold text-foreground sm:text-lg">{entry.title}</p>
                                    <p class="mt-1 text-sm text-muted">
                                        {entry.type === 'dub_available'
                                            ? 'Dubbed episode available'
                                            : 'Episode available'} · Episode {entry.episodeNumber}
                                    </p>
                                    <span
                                        class="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase"
                                    >
                                        Watch now <span aria-hidden="true">›</span>
                                    </span>
                                </div>
                            </button>
                        {/each}
                    </div>
                {/if}
            </section>
        </div>
    </main>
{/if}
