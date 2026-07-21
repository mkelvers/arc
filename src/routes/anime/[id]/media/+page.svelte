<script lang="ts">
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.anime.title} media — Arc</title></svelte:head>

<main class="min-h-screen bg-black px-6 py-10 text-white sm:px-10 lg:px-16">
    <header class="mb-12 flex items-end justify-between gap-6">
        <div>
            <a href={`/anime/${data.anime.id}`} class="text-sm text-orange-500">← Back to anime</a>
            <h1 class="mt-3 text-4xl font-bold">{data.anime.title} media</h1>
            <p class="mt-2 text-zinc-400">TMDB {data.artwork.mediaType} #{data.artwork.id}</p>
        </div>
        <form method="POST">
            <input type="hidden" name="intent" value="refresh" />
            <button
                type="submit"
                class="border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-orange-500"
            >
                Refetch
            </button>
        </form>
    </header>

    <section>
        <div class="mb-5 flex items-center justify-between gap-8">
            <h2 class="text-2xl font-semibold">Logos ({data.artwork.logos.length})</h2>
            <form method="POST" class="flex w-full max-w-xs items-center gap-4">
                <input type="hidden" name="intent" value="logoSize" />
                <label for="logo-size" class="shrink-0 text-sm text-zinc-400">Logo size</label>
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
                    class="w-full accent-orange-500"
                />
            </form>
        </div>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            <form method="POST">
                <input type="hidden" name="type" value="logo" />
                <input type="hidden" name="filePath" value="" />
                <button
                    type="submit"
                    aria-pressed={data.artwork.logoHidden}
                    class:border-orange-500={data.artwork.logoHidden}
                    class:border-zinc-800={!data.artwork.logoHidden}
                    class="grid min-h-48 w-full place-items-center border bg-zinc-950 p-6 text-xl font-semibold"
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
                        class:border-orange-500={data.artwork.selectedLogo?.filePath === image.filePath}
                        class:border-zinc-800={data.artwork.selectedLogo?.filePath !== image.filePath}
                        class="grid min-h-48 w-full place-items-center border bg-zinc-950 p-6"
                    >
                        <img src={image.url} alt={`${data.anime.title} logo`} class="max-h-40 max-w-full" />
                        <span class="sr-only">{image.width} × {image.height}, {image.language ?? 'no language'}</span>
                    </button>
                </form>
            {/each}
        </div>
    </section>

    <section class="mt-14">
        <h2 class="mb-5 text-2xl font-semibold">Backdrops ({data.artwork.backdrops.length})</h2>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {#each data.artwork.backdrops as image}
                <form method="POST">
                    <input type="hidden" name="type" value="backdrop" />
                    <input type="hidden" name="filePath" value={image.filePath} />
                    <button
                        type="submit"
                        aria-pressed={data.artwork.selectedBackdrop?.filePath === image.filePath}
                        class:border-orange-500={data.artwork.selectedBackdrop?.filePath === image.filePath}
                        class:border-zinc-800={data.artwork.selectedBackdrop?.filePath !== image.filePath}
                        class="w-full overflow-hidden border bg-zinc-950 text-left"
                    >
                        <img src={image.url} alt={`${data.anime.title} backdrop`} class="aspect-video w-full object-cover" />
                        <span class="block px-3 py-2 text-xs text-zinc-500">
                            {image.width} × {image.height} · {image.language ?? 'no language'} · {image.voteAverage.toFixed(1)}
                        </span>
                    </button>
                </form>
            {/each}
        </div>
    </section>
</main>
