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
    let hoverPaused = $state(false);
    let focusPaused = $state(false);
    let pointerPaused = $state(false);
    let pointerId = $state<number | null>(null);
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let suppressClick = $state(false);
    let carousel = $state<HTMLElement>();

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
        if (hoverPaused || focusPaused || pointerPaused || prefersReducedMotion.current || count < 2) {
            return;
        }

        const timeout = window.setTimeout(() => select(active + 1), interval);
        return () => window.clearTimeout(timeout);
    });

    function select(index: number) {
        if (!count) {
            return false;
        }

        const next = ((index % count) + count) % count;
        if (next === active) {
            return false;
        }

        active = next;
        return true;
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
        pointerPaused = true;
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
            suppressClick = select(active + (deltaX < 0 ? 1 : -1));
        }

        pointerId = null;
        pointerPaused = false;
        dragging = false;
    }

    function handleClick(event: MouseEvent) {
        if (!suppressClick || !(carousel && event.target instanceof Node && carousel.contains(event.target))) {
            return;
        }

        suppressClick = false;
        event.preventDefault();
    }

    function handleFocusOut(event: FocusEvent) {
        if (
            event.currentTarget instanceof HTMLElement &&
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
        ) {
            return;
        }

        focusPaused = false;
    }
</script>

<section
    bind:this={carousel}
    class={cn('relative', className)}
    aria-roledescription="carousel"
    aria-label={ariaLabel}
    onmouseenter={() => (hoverPaused = true)}
    onmouseleave={() => (hoverPaused = false)}
    onfocusin={() => (focusPaused = true)}
    onfocusout={handleFocusOut}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={() => {
        pointerId = null;
        pointerPaused = false;
        dragging = false;
    }}
>
    {#each Array(count) as _, index}
        {@render children(index, index === active, index === previous)}
    {/each}

    {@render overlay?.(
        select,
        active,
        previous,
        hoverPaused || focusPaused || pointerPaused || prefersReducedMotion.current
    )}
</section>

<svelte:window onclick={handleClick} />
