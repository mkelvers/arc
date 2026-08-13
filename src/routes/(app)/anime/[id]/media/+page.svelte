<script lang="ts">
    import ProgressiveImage from '$lib/components/ProgressiveImage.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<main class="min-h-dvh min-w-0 bg-canvas px-4 py-6 text-foreground sm:px-8 sm:py-10 lg:px-16">
    <header class="mb-10 flex flex-col items-start gap-6 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
            <a href={`/anime/${data.anime.id}`} class="text-sm text-accent">← Back to anime</a>
            <h1 class="mt-3 text-3xl leading-tight font-bold sm:text-4xl">
                {data.anime.title} media
            </h1>
            {#if data.artwork}
                <p class="mt-2 text-muted">TMDB {data.artwork.mediaType} #{data.artwork.id}</p>
            {/if}
        </div>
        {#if data.artwork}
            <form method="POST" class="shrink-0">
                <input type="hidden" name="intent" value="refresh" />
                <button
                    type="submit"
                    class="min-h-11 border border-border px-4 py-2 text-sm font-semibold hover:border-accent"
                >
                    Refetch
                </button>
            </form>
        {/if}
    </header>

    {#if !data.artwork}
        <section class="max-w-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 class="text-xl font-semibold sm:text-2xl">No TMDB media available</h2>
            <p class="mt-3 leading-7 text-muted">
                This release is still available on Arc, but no reliable TMDB match was found. Its media options
                will appear automatically when a confident match becomes available.
            </p>
            <a
                href={`/anime/${data.anime.id}`}
                class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-sm font-semibold text-on-accent"
            >
                Back to anime
            </a>
        </section>
    {:else}
        <section>
            <div
                class="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
            >
                <h2 class="text-xl font-semibold sm:text-2xl">
                    Logos ({data.artwork.logos.length})
                </h2>
                <form method="POST" class="flex w-full items-center gap-4 sm:max-w-xs">
                    <input type="hidden" name="intent" value="logoSize" />
                    <label for="logo-size" class="shrink-0 text-sm text-muted">Logo size</label>
                    <input
                        id="logo-size"
                        name="logoSize"
                        type="range"
                        min="50"
                        max="300"
                        step="5"
                        value={data.artwork.logoSize}
                        aria-label="Logo size"
                        onchange={(event) => event.currentTarget.form?.requestSubmit()}
                        class="w-full accent-accent"
                    />
                </form>
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <form method="POST">
                    <input type="hidden" name="type" value="logo" />
                    <input type="hidden" name="filePath" value="" />
                    <button
                        type="submit"
                        aria-pressed={data.artwork.logoHidden}
                        class:border-accent={data.artwork.logoHidden}
                        class:border-border={!data.artwork.logoHidden}
                        class="grid min-h-40 w-full place-items-center border bg-surface p-5 text-xl font-semibold sm:min-h-48 sm:p-6"
                    >
                        No logo
                    </button>
                </form>
                {#each data.artwork.logos as image}
                    <form method="POST">
                        <input type="hidden" name="type" value="logo" />
                        <input type="hidden" name="filePath" value={image.filePath} />
                        <button
                            type="submit"
                            aria-pressed={data.artwork.selectedLogo?.filePath === image.filePath}
                            class:border-accent={data.artwork.selectedLogo?.filePath === image.filePath}
                            class:border-border={data.artwork.selectedLogo?.filePath !== image.filePath}
                            class="grid min-h-40 w-full place-items-center border bg-surface p-5 sm:min-h-48 sm:p-6"
                        >
                            <img src={image.url} alt={`${data.anime.title} logo`} class="max-h-40 max-w-full" />
                            <span class="sr-only">
                                {image.width} × {image.height}, {image.language ?? 'no language'}
                            </span>
                        </button>
                    </form>
                {/each}
            </div>
        </section>

        <section class="mt-14">
            <h2 class="mb-5 text-xl font-semibold sm:text-2xl">
                Backdrops ({data.artwork.backdrops.length})
            </h2>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {#each data.artwork.backdrops as image}
                    <form method="POST">
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
                                {image.width} × {image.height} · {image.language ?? 'no language'} · {image.voteAverage.toFixed(
                                    1
                                )}
                            </span>
                        </button>
                    </form>
                {/each}
            </div>
        </section>
    {/if}
</main>
