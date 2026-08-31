<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';

    interface Props extends HTMLInputAttributes {
        class?: string;
        value?: string;
        ref?: HTMLInputElement | null;
    }

    let { class: className, value = $bindable(), ref = $bindable(null), ...restProps }: Props = $props();
</script>

<input
    bind:this={ref}
    class={cn(
        'flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50',
        className
    )}
    bind:value={value}
    {...restProps}
/>
