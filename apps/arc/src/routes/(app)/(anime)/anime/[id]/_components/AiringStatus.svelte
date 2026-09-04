<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { EpisodeRevisionSchema } from '@arc/core/types';

    import { m } from '$lib/i18n.svelte';

    interface Props {
        animeId: number;
        airingAt: number;
        initialRevision: string | null;
    }

    let { animeId, airingAt, initialRevision }: Props = $props();
    let airingTime = $state('');
    const airingDate = $derived.by(() => {
        const date = new Date(airingAt * 1_000);
        const day = date.getDate();
        const suffix =
            day >= 11 && day <= 13
                ? 'th'
                : day % 10 === 1
                  ? 'st'
                  : day % 10 === 2
                    ? 'nd'
                    : day % 10 === 3
                      ? 'rd'
                      : 'th';

        return `${date.toLocaleDateString('en-US', { month: 'short' })} ${day}${suffix}`;
    });

    $effect(() => {
        airingTime = new Date(airingAt * 1_000).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
    });

    $effect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        let stopped = false;
        let warned = false;
        let revision = initialRevision;

        const poll = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const response = await fetch(`/v1/anime/${animeId}/episodes/revision`, {
                        cache: 'no-store',
                        signal: controller.signal,
                    });
                    if (!response.ok) {
                        throw new Error(`Episode update check returned ${response.status}`);
                    }

                    const result = EpisodeRevisionSchema.safeParse(await response.json());
                    if (!result.success) {
                        throw new Error('Episode update check returned an invalid response');
                    }

                    warned = false;
                    if (result.data.revision !== revision) {
                        revision = result.data.revision;
                        await invalidate(`arc:anime:${animeId}:episodes`);
                    }
                } catch (cause) {
                    if (!controller.signal.aborted && !warned) {
                        warned = true;
                        console.warn(`Episode update check failed for AniList ${animeId}`, cause);
                    }
                }
            }

            if (!stopped) {
                timer = setTimeout(poll, 60_000);
            }
        };

        timer = setTimeout(poll, 60_000);

        return () => {
            stopped = true;
            controller.abort();
            clearTimeout(timer);
        };
    });
</script>

<p class="mt-7 text-base font-semibold text-foreground/80 sm:mt-8 sm:text-lg">
    {m.anime_next_episode({ date: airingDate, time: airingTime ? ` at ${airingTime}` : '' })}
</p>
