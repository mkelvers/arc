<script lang="ts">
    import { m } from '$lib/i18n.svelte';

    interface Props {
        airingAt: number;
    }

    let { airingAt }: Props = $props();
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
</script>

<p class="mt-7 text-base font-semibold text-foreground/80 sm:mt-8 sm:text-lg">
    {m.anime_next_episode({ date: airingDate, time: airingTime ? ` at ${airingTime}` : '' })}
</p>
