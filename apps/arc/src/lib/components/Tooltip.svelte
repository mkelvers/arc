<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        text: string;
        children: Snippet;
        class?: string;
    }

    let { text, children, class: className }: Props = $props();
</script>

<span class={cn('group/tooltip relative inline-flex', className)}>
    {@render children()}
    <span
        role="tooltip"
        class="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 inline-flex min-h-11 -translate-x-1/2 items-center bg-tooltip px-3 text-[0.8125rem] leading-none font-normal whitespace-nowrap text-tooltip-foreground opacity-0 transition-opacity duration-100 after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-7 after:border-transparent after:border-t-tooltip after:content-[''] group-hover/tooltip:visible group-hover/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100"
    >
        {text}
    </span>
</span>
