<script lang="ts">
    import { ArrowClockwiseIcon, CaretLeftIcon } from 'phosphor-svelte';
    import { enhance } from '$app/forms';

    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/i18n.svelte';

    let { data }: PageProps = $props();
    const logos = $derived(
        [...(data.artwork?.logos ?? [])].sort(
            (left, right) => right.width * right.height - left.width * left.height
        )
    );
    const backdrops = $derived(
        [...(data.artwork?.backdrops ?? [])].sort(
            (left, right) => right.width * right.height - left.width * left.height
        )
    );
    let activeTab = $state<'logo' | 'backdrop'>('logo');
</script>

<svelte:head>
    <title>Arc — {data.anime.title} artwork</title>
    <meta name="description" content={`Choose artwork for ${data.anime.title} on Arc.`} />
</svelte:head>

<main class="min-h-dvh min-w-0 bg-canvas px-4 py-6 text-foreground sm:px-8 sm:py-10 lg:px-16">
    <header class="mb-10 flex flex-col items-start gap-6 sm:mb-12 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
            <a
                href={`/anime/${data.anime.id}`}
                class="inline-flex items-center gap-2 text-sm font-medium text-muted uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
                <CaretLeftIcon size="1rem" weight="bold" aria-hidden="true" />
                {m.media_back()}
            </a>
            <h1 class="mt-3 text-3xl leading-tight font-bold sm:text-4xl">
                {data.anime.title}
            </h1>
        </div>
        {#if data.artwork}
            <form method="POST" use:enhance class="shrink-0">
                <input type="hidden" name="intent" value="refresh" />
                <button
                    type="submit"
                    class="flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground"
                >
                    <ArrowClockwiseIcon size="1.2rem" weight="bold" aria-hidden="true" />
                    {m.media_refetch()}
                </button>
            </form>
        {/if}
    </header>

    {#if !data.artwork}
        <section class="max-w-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 class="text-xl font-semibold sm:text-2xl">{m.media_no_tmdb()}</h2>
            <p class="mt-3 leading-7 text-muted">
                {m.media_no_tmdb_body()}
            </p>
            <a
                href={`/anime/${data.anime.id}`}
                class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-sm font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
            >
                {m.media_back()}
            </a>
        </section>
    {:else}
        <nav class="mb-8 overflow-x-auto border-b border-border" aria-label={m.media_types()}>
            <div class="flex min-w-max gap-6" role="tablist">
                {#each [{ value: 'logo', label: m.media_logos(), count: data.artwork.logos.length }, { value: 'backdrop', label: m.media_backdrops(), count: data.artwork.backdrops.length }] as tab}
                    <button
                        type="button"
                        role="tab"
                        class:border-accent={activeTab === tab.value}
                        class:border-transparent={activeTab !== tab.value}
                        class:text-foreground={activeTab === tab.value}
                        class="border-b-2 px-1 py-3 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                        onclick={() => (activeTab = tab.value as typeof activeTab)}
                        aria-selected={activeTab === tab.value}
                    >
                        {tab.label}
                        <span class="text-subtle">({tab.count})</span>
                    </button>
                {/each}
            </div>
        </nav>

        {#if activeTab === 'logo'}
            <section>
                <div class="mb-5 flex justify-end">
                    <form method="POST" use:enhance class="flex items-center gap-4">
                        <input type="hidden" name="intent" value="logoSize" />
                        <label for="logo-size" class="shrink-0 text-sm text-muted">{m.media_logo_size()}</label>
                        <input
                            id="logo-size"
                            name="logoSize"
                            type="range"
                            min="50"
                            max="300"
                            step="5"
                            value={data.artwork.logoSize}
                            aria-label={m.media_logo_size()}
                            onchange={(event) => event.currentTarget.form?.requestSubmit()}
                            class="w-32 accent-accent"
                        />
                    </form>
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <form method="POST" use:enhance>
                        <input type="hidden" name="type" value="logo" />
                        <input type="hidden" name="filePath" value="" />
                        <button
                            type="submit"
                            aria-pressed={data.artwork.logoHidden}
                            class:border-accent={data.artwork.logoHidden}
                            class:border-border={!data.artwork.logoHidden}
                            class="grid min-h-40 w-full place-items-center border bg-surface p-5 text-xl font-semibold sm:min-h-48 sm:p-6"
                        >
                            {m.media_no_logo()}
                        </button>
                    </form>
                    {#each logos as image}
                        <form method="POST" use:enhance>
                            <input type="hidden" name="type" value="logo" />
                            <input type="hidden" name="filePath" value={image.filePath} />
                            <button
                                type="submit"
                                aria-pressed={data.artwork.selectedLogo?.filePath === image.filePath}
                                class:border-accent={data.artwork.selectedLogo?.filePath === image.filePath}
                                class:border-border={data.artwork.selectedLogo?.filePath !== image.filePath}
                                class="grid min-h-40 w-full place-items-center border bg-surface p-5 sm:min-h-48 sm:p-6"
                            >
                                <img
                                    src={image.url}
                                    alt={`${data.anime.title} logo`}
                                    class="max-h-40 max-w-full"
                                />
                                <span class="sr-only">
                                    {image.width} × {image.height}, {image.language ?? m.media_no_language()}
                                </span>
                            </button>
                        </form>
                    {/each}
                </div>
            </section>
        {:else}
            <section>
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {#each backdrops as image}
                        <form method="POST" use:enhance>
                            <input type="hidden" name="type" value="backdrop" />
                            <input type="hidden" name="filePath" value={image.filePath} />
                            <button
                                type="submit"
                                aria-pressed={data.artwork.selectedBackdrop?.filePath === image.filePath}
                                class:border-accent={data.artwork.selectedBackdrop?.filePath === image.filePath}
                                class:border-border={data.artwork.selectedBackdrop?.filePath !== image.filePath}
                                class="w-full overflow-hidden border bg-surface text-left"
                            >
                                <ProgressiveImage
                                    src={image.url}
                                    alt={`${data.anime.title} backdrop`}
                                    previewSize="w300"
                                    class="aspect-video w-full"
                                />
                                <span class="block px-3 py-2 text-xs text-subtle">
                                    {image.width} × {image.height} · {image.language ?? m.media_no_language()} · {image.voteAverage.toFixed(
                                        1
                                    )}
                                </span>
                            </button>
                        </form>
                    {/each}
                </div>
            </section>
        {/if}
    {/if}
</main>
