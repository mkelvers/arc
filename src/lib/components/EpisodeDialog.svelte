<script lang="ts">
    import type { AnimeEpisode } from '$lib/anime';
    import { XIcon } from 'phosphor-svelte';

    interface Props {
        open: boolean;
        title: string;
        episodes: AnimeEpisode[];
        currentId: string;
        image?: string | null;
        onclose: () => void;
    }

    let {
        open,
        title,
        episodes,
        currentId,
        image = null,
        onclose,
    }: Props = $props();
    let dialog: HTMLDialogElement;

    $effect(() => {
        if (!dialog) return;

        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    });

    function backdropClick(event: MouseEvent) {
        if (event.target === dialog) onclose();
    }
</script>

<dialog
    bind:this={dialog}
    aria-labelledby="episode-dialog-title"
    class="m-auto h-[min(88dvh,68rem)] w-[min(61rem,calc(100%-2rem))] max-w-none overflow-hidden bg-[#282828] p-0 text-white backdrop:bg-black/75"
    onclick={backdropClick}
    oncancel={onclose}
    onclose={onclose}
>
    <div class="flex h-full flex-col">
        <header class="flex min-h-20 shrink-0 items-center border-b border-black/15 bg-[#2d2d2d] px-5 sm:px-8">
            <h2 id="episode-dialog-title" class="line-clamp-1 text-lg font-bold sm:text-xl">
                {title}
            </h2>
            <button
                type="button"
                class="ml-auto grid size-11 place-items-center hover:bg-white/8 focus-visible:outline-1 focus-visible:outline-white"
                aria-label="Close episode list"
                onclick={onclose}
            >
                <XIcon size="1.75rem" weight="bold" aria-hidden="true" />
            </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
            <div class="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {#each episodes as episode}
                    <a
                        href={episode.href}
                        aria-current={episode.id === currentId ? 'page' : undefined}
                        class:bg-[#191919]={episode.id === currentId}
                        class="group block min-w-0 p-3 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                        <div class="relative aspect-video overflow-hidden bg-[#171717]">
                            {#if episode.imageUrl || image}
                                <img
                                    src={episode.imageUrl ?? image ?? ''}
                                    alt=""
                                    class="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                    loading="lazy"
                                />
                            {/if}
                            {#if episode.id === currentId}
                                <span class="absolute top-2 left-2 bg-accent px-2 py-1 text-[0.65rem] font-bold text-black uppercase">
                                    Now playing
                                </span>
                            {/if}
                            {#if episode.duration}
                                <span class="absolute right-1.5 bottom-1.5 bg-black/75 px-1.5 py-0.5 text-sm font-bold text-white">
                                    {episode.duration}
                                </span>
                            {/if}
                        </div>
                        <p class="mt-3 line-clamp-1 text-[0.65rem] font-semibold text-[#8e8e8e] uppercase">
                            {title}
                        </p>
                        <h3 class="mt-2 line-clamp-2 text-base leading-snug font-bold text-white">
                            {episode.label} – {episode.title}
                        </h3>
                        <p class="mt-3 text-sm text-[#949494]">{episode.audioLabel}</p>
                    </a>
                {/each}
            </div>
        </div>
    </div>
</dialog>
