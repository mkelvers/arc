<script lang="ts">
    import { type AnimePageDeferred } from '@arc/core/client';

    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';

    type Props = {
        retrying: boolean;
        status: AnimePageDeferred['episodeInventory']['status'];
        onretry: () => void;
    };

    let { retrying, status, onretry }: Props = $props();
</script>

{#if status === 'pending'}
    <p class="mt-6 text-center text-sm text-muted" role="status" aria-live="polite">
        {m.anime_loading_episodes()}…
    </p>
{:else if status === 'failed'}
    <div class="mx-auto max-w-md py-8 text-center" role="alert">
        <p class="text-sm text-muted">{m.anime_load_error()}</p>
        <Button
            type="button"
            class="mt-4 min-h-10 px-5 text-sm font-bold text-on-accent uppercase"
            disabled={retrying}
            onclick={onretry}
        >
            {retrying ? m.retrying() : m.retry()}
        </Button>
    </div>
{/if}
