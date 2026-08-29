<script lang="ts">
    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';

    interface Props {
        variant?: 'poster' | 'compact' | 'top';
    }

    let { variant = 'poster' }: Props = $props();
</script>

<Card variant={variant === 'poster' ? undefined : variant === 'top' ? 'landscape' : 'compact'}>
    {#if variant === 'compact'}
        <div class="flex min-h-28 gap-3 p-2" aria-hidden="true">
            <CardMedia aspect="poster" class="h-24 shrink-0">
                <div class="size-full animate-pulse bg-surface motion-reduce:animate-none"></div>
            </CardMedia>
            <div class="min-w-0 flex-1 py-1">
                <div class="h-4 w-4/5 animate-pulse bg-surface motion-reduce:animate-none"></div>
                <div class="mt-3 h-3 w-3/5 animate-pulse bg-surface motion-reduce:animate-none"></div>
                <div class="mt-8 h-4 w-2/5 animate-pulse bg-surface motion-reduce:animate-none"></div>
            </div>
        </div>
    {:else}
        <div aria-hidden="true">
            <CardMedia aspect={variant === 'top' ? 'video' : 'poster'}>
                <div class="size-full animate-pulse bg-surface motion-reduce:animate-none"></div>
            </CardMedia>
            <div class="mt-3 h-4 w-3/4 animate-pulse bg-surface motion-reduce:animate-none"></div>
            <div class="mt-2 h-4 w-2/5 animate-pulse bg-surface motion-reduce:animate-none"></div>
        </div>
    {/if}
</Card>
