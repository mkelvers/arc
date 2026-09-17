<script lang="ts">
    import { cn } from '$lib/utils';

    let { class: className }: { class?: string } = $props();
</script>

<svelte:element
    this={"div"}
    class={cn('animate-pulse rounded-md bg-surface motion-reduce:animate-none', className)}
    aria-hidden="true"
/>
