<script lang="ts">
    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';

    type Props = {
        retrying: boolean;
        onretry: () => void;
    };

    let { retrying, onretry }: Props = $props();
</script>

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
