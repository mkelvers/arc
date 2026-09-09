<script lang="ts">
    import type { Snippet } from 'svelte';
    import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
    import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
    import { cn } from '$lib/utils';
    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        children: Snippet;
        label: string;
        trackClass: string;
        class?: string;
        controlOffset?: number;
    }

    let { children, label, trackClass, class: className, controlOffset }: Props = $props();
    let track = $state<HTMLDivElement>();
    let canGoBack = $state(false);
    let canGoForward = $state(false);

    function syncControls() {
        if (!track) {
            return;
        }

        canGoBack = track.scrollLeft > 2;
        canGoForward = track.scrollLeft + track.clientWidth < track.scrollWidth - 2;

        if (controlOffset !== undefined) {
            const firstCard = track.firstElementChild;
            if (firstCard instanceof HTMLElement) {
                track.parentElement?.style.setProperty(
                    '--rail-control-center',
                    `${firstCard.clientWidth * controlOffset}px`
                );
            }
        }
    }

    function scroll(direction: -1 | 1) {
        if (!track) {
            return;
        }

        const firstCard = track.children[0];
        const secondCard = track.children[1];
        const pitch =
            firstCard instanceof HTMLElement && secondCard instanceof HTMLElement
                ? secondCard.offsetLeft - firstCard.offsetLeft
                : track.clientWidth;
        const page = Math.max(1, Math.floor(track.clientWidth / Math.max(pitch, 1)));

        track.scrollBy({ left: direction * page * pitch, behavior: 'smooth' });
    }

    $effect(() => {
        if (!track) {
            return;
        }

        syncControls();
        const observer = new ResizeObserver(syncControls);
        observer.observe(track);

        return () => observer.disconnect();
    });
</script>

<div class={cn('relative [--rail-control-center:50%]', className)}>
    <div bind:this={track} class={trackClass} onscroll={syncControls}>
        {@render children()}
    </div>

    {#if canGoBack}
        <Button
            variant="unstyled"
            type="button"
            class="absolute top-(--rail-control-center) left-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
            aria-label={`${label}: ${m.shared_previous()}`}
            onclick={() => scroll(-1)}
        >
            <CaretLeftIcon size="1.65rem" weight="bold" aria-hidden="true" />
        </Button>
    {/if}

    {#if canGoForward}
        <Button
            variant="unstyled"
            type="button"
            class="absolute top-(--rail-control-center) right-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
            aria-label={`${label}: ${m.shared_next()}`}
            onclick={() => scroll(1)}
        >
            <CaretRightIcon size="1.65rem" weight="bold" aria-hidden="true" />
        </Button>
    {/if}
</div>
