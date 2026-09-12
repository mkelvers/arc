<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';

    interface Props extends HTMLInputAttributes {
        class?: string;
        value?: HTMLInputAttributes['value'];
        ref?: HTMLInputElement | null;
    }

    let {
        class: className,
        type = 'text',
        value = $bindable(),
        ref = $bindable(null),
        ...restProps
    }: Props = $props();
    const textInputTypes = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number']);
</script>

<input
    bind:this={ref}
    class={cn(
        textInputTypes.has(type ?? 'text')
            ? 'flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50'
            : '',
        className
    )}
    type={type ?? 'text'}
    bind:value={value}
    {...restProps}
/>
