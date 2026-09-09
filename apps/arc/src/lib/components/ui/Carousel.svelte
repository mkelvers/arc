<script lang="ts">
    import type { Snippet } from 'svelte';
    import { prefersReducedMotion } from 'svelte/motion';
    import { cn } from '$lib/utils';

    interface Props {
        count: number;
        ariaLabel: string;
        children: Snippet<[index: number, active: boolean, previous: boolean]>;
        overlay?: Snippet<
            [select: (index: number) => void, active: number, previous: number | null, paused: boolean]
        >;
        class?: string;
        interval?: number;
        active?: number;
    }

    let {
        count,
        ariaLabel,
        children,
        overlay,
        class: className,
        interval = 15_000,
        active = $bindable(0),
    }: Props = $props();

    let previous = $state<number | null>(null);
    let lastActive = $state(active);
    let paused = $state(false);
    let pointerId = $state<number | null>(null);
    let startX = 0;
    let startY = 0;
    let dragging = false;

    $effect(() => {
        if (!count) {
            return;
        }

        const next = ((active % count) + count) % count;
        if (next !== active) {
            active = next;
            return;
        }

        if (next !== lastActive) {
            previous = prefersReducedMotion.current ? null : lastActive;
            lastActive = next;
        }
    });

    $effect(() => {
        if (paused || prefersReducedMotion.current || count < 2) {
            return;
        }

        const timeout = window.setTimeout(() => select(active + 1), interval);
        return () => window.clearTimeout(timeout);
    });

    function select(index: number) {
        if (count) {
            active = ((index % count) + count) % count;
        }
    }

    function handlePointerDown(event: PointerEvent) {
        if (
            event.pointerType === 'mouse' ||
            (event.target instanceof Element &&
                event.target.closest('button, [data-carousel-control], [data-carousel-action]'))
        ) {
            return;
        }

        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        dragging = false;
        if (event.currentTarget instanceof HTMLElement) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
    }

    function handlePointerMove(event: PointerEvent) {
        if (event.pointerId !== pointerId) {
            return;
        }

        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (!dragging && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
            dragging = true;
        }

        if (dragging) {
            event.preventDefault();
        }
    }

    function handlePointerUp(event: PointerEvent) {
        if (event.pointerId !== pointerId) {
            return;
        }

        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (dragging && Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
            event.preventDefault();
            select(active + (deltaX < 0 ? 1 : -1));
        }

        pointerId = null;
        dragging = false;
    }
</script>

<section
    class={cn('relative', className)}
    aria-roledescription="carousel"
    aria-label={ariaLabel}
    onmouseenter={() => (paused = true)}
    onmouseleave={() => (paused = false)}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={() => {
        pointerId = null;
        dragging = false;
    }}
>
    {#each Array(count) as _, index}
        {@render children(index, index === active, index === previous)}
    {/each}

    {@render overlay?.(select, active, previous, paused || prefersReducedMotion.current)}
</section>
