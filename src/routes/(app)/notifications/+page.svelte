<script lang="ts">
    import { CaretLeftIcon, CaretRightIcon, LinkSimpleIcon } from 'phosphor-svelte';

    import emptyArtwork from '$lib/assets/notifications-empty.png';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <meta
        name="description"
        content="New anime episodes and related releases from your connected AniList account."
    />
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
        <h1 class="text-center text-2xl font-semibold">Notification Center</h1>

        {#if data.unavailable}
            <section class="mt-10 border border-border px-6 py-16 text-center">
                <h2 class="text-lg font-semibold">AniList is temporarily unavailable.</h2>
                <p class="mt-2 text-sm text-muted">Your notification feed could not be loaded.</p>
                <a
                    href="/notifications"
                    class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >Retry</a
                >
            </section>
        {:else if data.result && !data.result.connected}
            <section class="mt-10 border border-border px-6 py-16 text-center">
                <LinkSimpleIcon size="2rem" class="mx-auto text-muted" aria-hidden="true" />
                <h2 class="mt-4 text-lg font-semibold">
                    Connect AniList to receive notifications.
                </h2>
                <p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
                    Arc publishes your library to AniList, then reads AniList’s own episode and
                    related-release notification feed.
                </p>
                <a
                    href="/settings/accounts"
                    class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >Connect AniList</a
                >
            </section>
        {:else if data.result?.connected}
            {#if !data.result.settings.airing || !data.result.settings.relatedMedia}
                <aside
                    class="mt-6 border-l-2 border-accent bg-surface px-5 py-4 text-sm leading-6 text-muted"
                >
                    AniList has {data.result.settings.airing ? '' : 'airing notifications'}{!data
                        .result.settings.airing && !data.result.settings.relatedMedia
                        ? ' and '
                        : ''}{data.result.settings.relatedMedia
                        ? ''
                        : 'related-media notifications'} disabled. Enable them in AniList’s notification
                    settings to receive the complete feed.
                </aside>
            {/if}

            {#if data.result.notifications.length}
                <section class="mx-auto mt-10 grid max-w-6xl gap-3" aria-label="Notifications">
                    {#each data.result.notifications as notification (notification.id)}
                        <article
                            class="group grid overflow-hidden bg-canvas transition-colors hover:bg-surface focus-within:bg-surface sm:grid-cols-[20rem_minmax(0,1fr)]"
                        >
                            {#if notification.image}
                                <img
                                    src={notification.image}
                                    alt=""
                                    class="aspect-video h-full w-full object-cover sm:aspect-[4/3]"
                                    loading="lazy"
                                />
                            {:else}
                                <div class="hidden aspect-[4/3] bg-panel sm:block"></div>
                            {/if}

                            <div class="min-w-0 px-5 py-6 sm:px-6 sm:py-5">
                                <h2 class="text-xl font-semibold sm:text-2xl">
                                    {notification.title}
                                </h2>
                                <p class="mt-2 max-w-3xl text-base leading-6 text-muted">
                                    {notification.body}
                                </p>
                                <a
                                    href={notification.href}
                                    class="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-muted uppercase transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                    {notification.actionLabel}
                                    <CaretRightIcon size="1rem" weight="bold" aria-hidden="true" />
                                </a>
                            </div>
                        </article>
                    {/each}
                </section>
            {:else}
                <section
                    class="mt-10 grid min-h-120 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-12"
                    aria-labelledby="empty-notifications-title"
                >
                    <div class="flex max-w-md flex-col items-center">
                        <img
                            src={emptyArtwork}
                            alt=""
                            width="1254"
                            height="1254"
                            class="h-auto w-64 sm:w-72"
                        />
                        <h2 id="empty-notifications-title" class="mt-1 text-lg font-semibold">
                            You’re all caught up.
                        </h2>
                        <p class="mt-2 text-sm leading-6 text-muted">
                            New episodes and related releases will appear here.
                        </p>
                    </div>
                </section>
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
