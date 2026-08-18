<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cva } from 'class-variance-authority';

    import { cn } from '$lib/utils';

    const cardVariants = cva('group relative min-w-0', {
        variants: {
            variant: {
                poster: 'isolate p-2 text-foreground transition-colors focus-within:z-10 focus-within:border-foreground hover:z-10',
                compact: 'transition-colors hover:bg-surface focus-within:bg-surface',
                landscape: 'text-foreground',
            },
        },
        defaultVariants: {
            variant: 'poster',
        },
    });

    interface Props {
        children: Snippet;
        class?: string;
        selected?: boolean;
        variant?: 'poster' | 'compact' | 'landscape';
    }

    let { children, class: className, selected = false, variant = 'poster' }: Props = $props();
</script>

<article
    class={cn(
        cardVariants({ variant }),
        variant === 'poster' && (selected ? 'border-foreground' : 'border-transparent'),
        className
    )}
>
    {@render children()}
</article>
