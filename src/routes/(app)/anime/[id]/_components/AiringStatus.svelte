<script lang="ts">
    import { invalidate } from '$app/navigation';

    interface Props {
        animeId: number;
        episode: number;
        airingAt: number;
        initialRevision: Promise<string | null>;
    }

    let { animeId, episode, airingAt, initialRevision }: Props = $props();
    let now = $state(Date.now());

    const countdown = $derived.by(() => {
        const minutes = Math.max(0, Math.ceil((airingAt * 1_000 - now) / 60_000));
        if (minutes === 0) {
            return 'airing now';
        }

        const days = Math.floor(minutes / (24 * 60));
        const hours = Math.floor((minutes % (24 * 60)) / 60);
        const remainder = minutes % 60;

        return `in ${[days ? `${days}d` : '', hours ? `${hours}h` : '', `${remainder}m`]
            .filter(Boolean)
            .join(' ')}`;
    });

    $effect(() => {
        const timer = setInterval(() => (now = Date.now()), 60_000);

        return () => clearInterval(timer);
    });

    $effect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        let stopped = false;
        let warned = false;

        void initialRevision.then((value) => {
            if (stopped) {
                return;
            }

            let revision = value;

            const poll = async () => {
                if (document.visibilityState === 'visible') {
                    try {
                        const response = await fetch(`/api/anime/${animeId}/episodes/revision`, {
                            cache: 'no-store',
                            signal: controller.signal,
                        });
                        if (!response.ok) {
                            throw new Error(`Episode update check returned ${response.status}`);
                        }

                        const result: unknown = await response.json();
                        if (
                            !result ||
                            typeof result !== 'object' ||
                            !('revision' in result) ||
                            (result.revision !== null && typeof result.revision !== 'string')
                        ) {
                            throw new Error('Episode update check returned an invalid response');
                        }

                        warned = false;
                        if (result.revision !== revision) {
                            revision = result.revision;
                            await invalidate(`arc:anime:${animeId}:episodes`);
                        }
                    } catch (cause) {
                        if (!controller.signal.aborted && !warned) {
                            warned = true;
                            console.warn(
                                `Episode update check failed for AniList ${animeId}`,
                                cause
                            );
                        }
                    }
                }

                if (!stopped) {
                    timer = setTimeout(poll, 3_000);
                }
            };

            timer = setTimeout(poll, 3_000);
        });

        return () => {
            stopped = true;
            controller.abort();
            clearTimeout(timer);
        };
    });
</script>

<span class="anime-hero-metadata__tag">
    Airing · E{episode}
    {countdown}
</span>
