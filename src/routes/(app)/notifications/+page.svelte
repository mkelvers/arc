<script lang="ts">
    import ProgressiveImage from '$lib/components/ProgressiveImage.svelte';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    import emptyArtwork from '$lib/assets/notifications-empty.png';
    import EmptyState from '$lib/components/EmptyState.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <meta
        name="description"
        content="Playable anime episodes, new audio releases, and related-season notifications."
    />
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-6xl px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
        <h1 class="border-b border-border pb-5 text-center text-2xl font-semibold">
            Notification Center
        </h1>

        {#if data.unavailable}
            <section class="mt-10 border border-border px-6 py-16 text-center">
                <h2 class="text-lg font-semibold">Notifications are temporarily unavailable.</h2>
                <p class="mt-2 text-sm text-muted">Your notification feed could not be loaded.</p>
                <a
                    href="/notifications"
                    class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >Retry</a
                >
            </section>
        {:else if data.result}
            {#if data.result.notifications.length}
                <section class="mx-auto mt-10 grid max-w-6xl gap-3" aria-label="Notifications">
                    {#each data.result.notifications as notification (notification.id)}
                        <article
                            class="group relative grid overflow-hidden bg-canvas transition-colors hover:bg-surface focus-within:bg-surface sm:grid-cols-[20rem_minmax(0,1fr)]"
                        >
                            {#if notification.image}
                                <ProgressiveImage
                                    src={notification.image}
                                    alt=""
                                    previewSize="w300"
                                    class="aspect-video h-full w-full sm:aspect-[4/3]"
                                />
                            {:else}
                                <div class="hidden aspect-[4/3] bg-panel sm:block"></div>
                            {/if}

                            <a
                                href={notification.href}
                                class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                aria-label={`View ${notification.title}`}
                            >
                                <span class="sr-only">View {notification.title}</span>
                            </a>

                            <div
                                class="pointer-events-none relative z-10 min-w-0 px-5 py-6 sm:px-6 sm:py-5"
                            >
                                <h2 class="text-xl font-semibold sm:text-2xl">
                                    {notification.title}
                                </h2>
                                {#if notification.audioLabel}
                                    <p
                                        class="mt-2 text-xs font-medium tracking-wide text-foreground uppercase"
                                    >
                                        {notification.audioLabel}
                                    </p>
                                {/if}
                                <p class="mt-2 max-w-3xl text-base leading-6 text-muted">
                                    {notification.body}
                                </p>
                                {#if notification.watchHref}
                                    <a
                                        href={notification.watchHref}
                                        class="pointer-events-auto mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-muted uppercase transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        {notification.actionLabel}
                                        <CaretRightIcon
                                            size="1rem"
                                            weight="bold"
                                            aria-hidden="true"
                                        />
                                    </a>
                                {/if}
                            </div>
                        </article>
                    {/each}
                </section>
            {:else}
                <EmptyState
                    artwork={emptyArtwork}
                    artworkWidth={1254}
                    artworkHeight={1254}
                    id="empty-notifications-title"
                    title="You’re all caught up."
                    body="We’ll let you know when something new arrives."
                />
            {/if}

            {#if data.page > 1 || data.result.hasNextPage}
                <nav class="mt-8 flex items-center justify-between" aria-label="Notification pages">
                    {#if data.page > 1}
                        <a
                            href={data.page === 2
                                ? '/notifications'
                                : `/notifications?page=${data.page - 1}`}
                            class="inline-flex min-h-10 items-center gap-1 px-3 text-sm font-medium text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            <CaretLeftIcon size="1rem" weight="bold" aria-hidden="true" /> Previous
                        </a>
                    {:else}
                        <span></span>
                    {/if}

                    {#if data.result.hasNextPage}
                        <a
                            href={`/notifications?page=${data.page + 1}`}
                            class="inline-flex min-h-10 items-center gap-1 px-3 text-sm font-medium text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Next <CaretRightIcon size="1rem" weight="bold" aria-hidden="true" />
                        </a>
                    {/if}
                </nav>
            {/if}
        {/if}
    </div>
</main>
