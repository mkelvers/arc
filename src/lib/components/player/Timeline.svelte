<script lang="ts">
    import { formatTime } from '$lib/player/media';

    interface Props {
        buffered: number;
        current: number;
        duration: number;
        onactivity: () => void;
        ondone: () => void;
        onscrub: (active: boolean) => void;
        onseek: (seconds: number) => void;
    }

    let { buffered, current, duration, onactivity, ondone, onscrub, onseek }: Props = $props();

    let preview = $state<number | null>(null);
    let position = $state(0);
    let scrubbing = $state(false);

    const progress = $derived(duration ? (current / duration) * 100 : 0);
    const bufferedProgress = $derived(duration ? (buffered / duration) * 100 : 0);

    function move(event: PointerEvent, seek = scrubbing) {
        const input = event.currentTarget as HTMLInputElement;
        const bounds = input.getBoundingClientRect();

        if (!duration || !bounds.width) {
            return;
        }

        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        preview = ratio * duration;

        // Keep the wider hour-format tooltip inside the timeline.
        position = Math.max(42, Math.min(bounds.width - 42, ratio * bounds.width));

        if (seek) {
            onseek(preview);
            onactivity();
        }
    }

    function start(event: PointerEvent) {
        if (event.button !== 0) {
            return;
        }

        const input = event.currentTarget as HTMLInputElement;
        scrubbing = true;
        onscrub(true);
        input.setPointerCapture(event.pointerId);
        move(event, true);
        onactivity();
    }

    function end(event: PointerEvent) {
        const input = event.currentTarget as HTMLInputElement;
        move(event, true);
        scrubbing = false;
        onscrub(false);

        if (input.hasPointerCapture(event.pointerId)) {
            input.releasePointerCapture(event.pointerId);
        }

        ondone();
        onactivity();
    }

    function cancel() {
        scrubbing = false;
        preview = null;
        onscrub(false);
    }
</script>

<div class="mt-2 flex items-center gap-3 px-1 text-xs font-medium sm:mt-3 sm:gap-4">
    <span class="w-18 shrink-0 pl-1 text-left whitespace-nowrap tabular-nums">
        {formatTime(current)}
    </span>

    <div class="group/timeline relative flex h-7 min-w-0 flex-1 items-center">
        {#if preview !== null}
            <div
                class="pointer-events-none absolute bottom-full z-30 mb-2 min-w-max -translate-x-1/2 bg-white px-2 py-1 text-xs font-bold whitespace-nowrap text-black shadow-md"
                data-timeline-position={`${position}px`}
            >
                {formatTime(preview)}
            </div>
        {/if}

        <div
            class="timeline-progress relative h-1 w-full bg-white/25 transition-all group-hover/timeline:h-1.5"
            data-buffered-progress={`${bufferedProgress}%`}
            data-progress={`${progress}%`}
            aria-hidden="true"
        ></div>

        <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={current}
            aria-label="Seek video"
            class="absolute inset-0 z-20 cursor-pointer opacity-0"
            oninput={(event) => onseek(Number(event.currentTarget.value))}
            onpointerdown={start}
            onpointermove={move}
            onpointerleave={() => {
                if (!scrubbing) {
                    preview = null;
                }
            }}
            onpointerup={end}
            onpointercancel={cancel}
        />
    </div>

    <span class="w-18 shrink-0 pr-1 text-right whitespace-nowrap tabular-nums">
        {formatTime(duration)}
    </span>
</div>
