<script lang="ts">
    import { Card, CardMedia } from '$lib/components/ui/card';
    import { Skeleton } from '$lib/components/ui/skeleton';

    interface Props {
        variant?: 'poster' | 'compact' | 'top';
    }

    let { variant = 'poster' }: Props = $props();
</script>

<Card variant={variant === 'poster' ? undefined : variant === 'top' ? 'landscape' : 'compact'}>
    {#if variant === 'compact'}
        <div class="flex min-h-28 gap-3 p-2" aria-hidden="true">
            <CardMedia aspect="poster" class="h-24 shrink-0">
                <Skeleton class="size-full rounded-none" />
            </CardMedia>
            <div class="min-w-0 flex-1 py-1">
                <Skeleton class="h-4 w-4/5 rounded-none" />
                <Skeleton class="mt-3 h-3 w-3/5 rounded-none" />
                <Skeleton class="mt-8 h-4 w-2/5 rounded-none" />
            </div>
        </div>
    {:else}
        <div aria-hidden="true">
            <CardMedia aspect={variant === 'top' ? 'video' : 'poster'}>
                <Skeleton class="size-full rounded-none" />
            </CardMedia>
            <Skeleton class="mt-3 h-4 w-3/4 rounded-none" />
            <Skeleton class="mt-2 h-4 w-2/5 rounded-none" />
        </div>
    {/if}
</Card>
