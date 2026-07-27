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

    let {
        buffered,
        current,
        duration,
        onactivity,
        ondone,
        onscrub,
        onseek,
    }: Props = $props();

    let preview = $state<number | null>(null);
    let position = $state(0);
    let scrubbing = $state(false);

    const progress = $derived(duration ? (current / duration) * 100 : 0);
    const bufferedProgress = $derived(
        duration ? (buffered / duration) * 100 : 0,
    );

    function move(event: PointerEvent, seek = scrubbing) {
        const input = event.currentTarget as HTMLInputElement;
        const bounds = input.getBoundingClientRect();

        if (!duration || !bounds.width) {
            return;
        }

        const ratio = Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
        );
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
                style={`left: ${position}px`}
            >
                {formatTime(preview)}
                <span
                    class="absolute top-full left-1/2 size-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-white"
                    aria-hidden="true"
                ></span>
            </div>
        {/if}

        <div class="relative h-1 w-full bg-white/25 transition-all group-hover/timeline:h-1.5">
            <span
                class="absolute inset-y-0 left-0 bg-white/60"
                style={`width: ${bufferedProgress}%`}
                aria-hidden="true"
            ></span>
            <span
                class="absolute inset-y-0 left-0 bg-accent"
                style={`width: ${progress}%`}
                aria-hidden="true"
            ></span>
            <span
                class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-sm ring-1 ring-white/30 transition-opacity group-hover/timeline:opacity-100"
                style={`left: ${progress}%`}
                aria-hidden="true"
            ></span>
        </div>

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
