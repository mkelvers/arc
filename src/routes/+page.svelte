<script lang="ts">
    import type { PageProps } from "./$types";

    import {
        CaretDownIcon,
        DotsThreeVerticalIcon,
        PlayIcon,
        ShareNetworkIcon,
    } from "phosphor-svelte";

    let { data }: PageProps = $props();
</script>

<figure
    class="grid min-h-screen grid-rows-[minmax(0,1fr)] overflow-hidden bg-black text-white before:pointer-events-none before:col-start-1 before:row-start-1 before:z-10 before:bg-[linear-gradient(to_right,rgb(0_0_0/0.72),transparent_34%),linear-gradient(to_left,rgb(0_0_0/0.44),transparent_26%),linear-gradient(to_bottom,rgb(0_0_0/0.18),transparent_16%)] after:pointer-events-none after:col-start-1 after:row-start-1 after:z-10 after:bg-[linear-gradient(to_top,rgb(0_0_0/1)_0%,rgb(0_0_0/0.96)_34%,transparent_64%),linear-gradient(to_top_right,rgb(0_0_0/0.62),transparent_58%),linear-gradient(to_top_left,rgb(0_0_0/0.6),transparent_58%)]"
>
    <img
        src="https://image.tmdb.org/t/p/original/uRkwj11OxvlhoaW78TCZGPEZs1w.jpg"
        alt="Haikyu!!"
        class="col-start-1 row-start-1 w-full h-175 object-[center_0%] object-cover"
    />

    <a
        href="/"
        class="z-20 col-start-1 row-start-1 mt-7 mr-16 flex h-fit items-center justify-self-end text-[clamp(0.875rem,0.88vw,1.125rem)] font-bold"
    >
        <DotsThreeVerticalIcon size="1.5em" weight="bold" aria-hidden="true" />
        <span class="ml-3">MORE</span>
    </a>

    <div
        class="z-20 col-start-1 row-start-1 mx-16 self-start pt-[clamp(11.25rem,11.72vw,15rem)]"
    >
        <a href="/" class="block w-fit">
            <img
                src="https://image.tmdb.org/t/p/original/hOdUyHuN0RYxBUmlw459Y3EgtiH.png"
                alt="Haikyu!!"
                class="h-[clamp(12rem,5.7vw,7.5rem)] w-auto"
            />
        </a>

        <p
            class="mt-[clamp(2rem,2.54vw,3.25rem)] text-[clamp(0.875rem,0.88vw,1.125rem)] text-zinc-300"
        >
            <span class="font-normal after:mx-1 after:content-['•']">
                {data.anime.format}
            </span>
            {#each data.anime.genres as genre, index}
                <a class="underline underline-offset-2" href="/">{genre}</a>{index <
                data.anime.genres.length - 1
                    ? ", "
                    : ""}
            {/each}
        </p>

        <div
            class="mt-[clamp(0.625rem,0.78vw,1rem)] flex items-center gap-[clamp(0.5rem,0.58vw,0.75rem)] text-[clamp(0.875rem,0.98vw,1.25rem)]"
        >
            <span
                class="flex items-center gap-0.5 text-zinc-300"
                aria-label="5 out of 5 stars"
            >
                {#each Array(5) as _}
                    <svg
                        class="size-[1.85em] fill-current"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path d="m12 2 2.85 6.59L22 9.27 16.55 14l1.63 7L12 17.27 5.82 21l1.63-7L2 9.27l7.15-.68z" />
                    </svg>
                {/each}
            </span>
            <span class="h-[1.7em] border-l border-zinc-500"></span>
            <strong>AniList score: {data.anime.score}%</strong>
            <CaretDownIcon size="0.9em" weight="fill" aria-hidden="true" />
        </div>

        <div
            class="mt-[clamp(1.875rem,1.95vw,2.5rem)] flex items-center gap-[clamp(0.5rem,0.58vw,0.75rem)] text-[clamp(0.75rem,0.78vw,1rem)] font-bold text-orange-500"
        >
            <button
                class="flex h-[clamp(2.625rem,2.73vw,3.5rem)] items-center gap-2.5 bg-orange-500 px-[clamp(1rem,1.36vw,1.75rem)] text-black"
            >
                <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                START WATCHING E1
            </button>
            <button
                class="grid size-[clamp(2.625rem,2.73vw,3.5rem)] place-items-center"
                aria-label="Share"
            >
                <ShareNetworkIcon
                    size="1.65em"
                    weight="regular"
                    aria-hidden="true"
                />
            </button>
        </div>

        <section
            class="mt-[clamp(3.75rem,3.9vw,5rem)] grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-[clamp(8.5rem,10.75vw,13.75rem)] text-[clamp(0.9375rem,0.88vw,1.125rem)] leading-[clamp(1.4rem,1.56vw,2rem)] text-zinc-400"
        >
            <p class="max-w-[96%] text-[1.03em] text-white">
                {data.anime.description}
            </p>
            <div class="space-y-[clamp(0.5rem,0.58vw,0.75rem)]">
                <p>
                    <strong class="font-normal text-white">Production:</strong>
                    {data.anime.studios.join(", ")}
                </p>
                <p>
                    <strong class="font-normal text-white">Key staff:</strong>
                    {data.anime.staff}
                </p>
                <p>
                    <strong class="font-normal text-white">Rankings:</strong>
                    {data.anime.rankings.join(", ")}
                </p>
                <p>
                    <strong class="font-normal text-white">Audience:</strong>
                    {data.anime.members} members, {data.anime.favourites} favorites
                </p>
                <p>
                    <strong class="font-normal text-white">Themes:</strong>
                    {data.anime.themes.join(", ")}
                </p>
                <p>
                    <strong class="font-normal text-white">Genres:</strong>
                    {#each data.anime.genres as genre, index}
                        <a class="underline underline-offset-2" href="/">{genre}</a>{index <
                        data.anime.genres.length - 1
                            ? ", "
                            : ""}
                    {/each}
                </p>
            </div>
        </section>
    </div>
</figure>
