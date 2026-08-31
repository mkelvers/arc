<script lang="ts">
    import { cn } from '$lib/utils';

    let { class: className }: { class?: string } = $props();
</script>

<div
    class={cn('animate-pulse rounded-md bg-surface motion-reduce:animate-none', className)}
    aria-hidden="true"
></div>
