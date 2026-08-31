<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    let { children, class: className }: { children?: Snippet; class?: string } = $props();
</script>

<div class={cn('flex flex-col gap-1.5 p-6', className)}>{@render children?.()}</div>
