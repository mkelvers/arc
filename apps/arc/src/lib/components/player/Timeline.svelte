<script lang="ts">
    import type { Player } from '$lib/player/controller.svelte';
    import { formatTime } from '$lib/player/media';

    interface Props {
        player: Player;
    }

    let { player }: Props = $props();
    let pointer = $state({
        preview: null as number | null,
        position: 0,
        scrubbing: false,
    });
    const position = $derived(
        pointer.scrubbing && pointer.preview !== null ? pointer.preview : player.media.currentTime
    );

    const progress = $derived({
        played: player.media.duration ? Math.max(0, Math.min(100, (position / player.media.duration) * 100)) : 0,

        buffered: player.media.duration
            ? Math.max(0, Math.min(100, (player.media.buffered / player.media.duration) * 100))
            : 0,
    });

    function move(event: PointerEvent) {
        const input = event.currentTarget as HTMLInputElement;
        const bounds = input.getBoundingClientRect();

        if (!player.media.duration || !bounds.width) {
            return;
        }

        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        pointer.preview = ratio * player.media.duration;

        // Keep the wider hour-format tooltip inside the timeline.
        pointer.position = Math.max(42, Math.min(bounds.width - 42, ratio * bounds.width));

        player.showControls();
    }

    function start(event: PointerEvent) {
        if (event.button !== 0) {
            return;
        }

        const input = event.currentTarget as HTMLInputElement;
        pointer.scrubbing = true;
        player.media.setScrubbing(true);
        input.setPointerCapture(event.pointerId);
        move(event);
        player.showControls();
    }

    function end(event: PointerEvent) {
        const input = event.currentTarget as HTMLInputElement;
        move(event);
        if (pointer.preview !== null) {
            player.media.seek(pointer.preview);
        }
        pointer.scrubbing = false;
        player.media.setScrubbing(false);

        if (input.hasPointerCapture(event.pointerId)) {
            input.releasePointerCapture(event.pointerId);
        }

        player.focus();
        player.showControls();
    }

    function cancel() {
        pointer.scrubbing = false;
        pointer.preview = null;
        player.media.setScrubbing(false);
    }
</script>

<div class="mt-2 flex items-center gap-3 px-1 text-xs font-medium sm:mt-3 sm:gap-4">
    <span class="w-18 shrink-0 pl-1 text-left whitespace-nowrap tabular-nums">
        {formatTime(player.media.currentTime)}
    </span>

    <div class="group/timeline relative flex h-7 min-w-0 flex-1 items-center">
        {#if pointer.preview !== null}
            <div
                class="pointer-events-none absolute bottom-full left-(--timeline-position) z-30 mb-2 min-w-max -translate-x-1/2 bg-white px-2 py-1 text-xs font-bold whitespace-nowrap text-black shadow-md after:absolute after:top-full after:left-1/2 after:size-0 after:-translate-x-1/2 after:border-x-1 after:border-x-transparent after:border-t-1 after:border-t-white after:content-['']"
                style:--timeline-position={`${pointer.position}px`}
            >
                {formatTime(pointer.preview)}
            </div>
        {/if}

        <div
            class="timeline-progress relative h-1 w-full rounded-full bg-white/25 transition-all before:absolute before:inset-y-0 before:left-0 before:w-(--buffered-progress) before:rounded-l-full before:bg-white/60 before:content-[''] after:absolute after:inset-y-0 after:left-0 after:w-(--progress) after:rounded-l-full after:bg-accent after:content-[''] group-hover/timeline:h-1.5"
            style:--buffered-progress={`${progress.buffered}%`}
            style:--progress={`${progress.played}%`}
            aria-hidden="true"
        >
            <span class="sr-only">Playback progress</span>
        </div>

        <input
            type="range"
            min="0"
            max={player.media.duration || 0}
            step="0.1"
            value={position}
            aria-label="Seek video"
            class="absolute inset-0 z-20 cursor-pointer opacity-0"
            oninput={(event) => {
                if (!pointer.scrubbing) {
                    player.media.seek(Number(event.currentTarget.value));
                }
            }}
            onpointerdown={start}
            onpointermove={move}
            onpointerleave={() => {
                if (!pointer.scrubbing) {
                    pointer.preview = null;
                }
            }}
            onpointerup={end}
            onpointercancel={cancel}
        />
    </div>

    <span class="w-18 shrink-0 pr-1 text-right whitespace-nowrap tabular-nums">
        {formatTime(player.media.duration)}
    </span>
</div>
