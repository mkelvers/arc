<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cva, type VariantProps } from 'class-variance-authority';
    import { cn } from '$lib/utils';

    const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', {
        variants: {
            variant: {
                default: 'border-transparent bg-accent text-on-accent',
                secondary: 'border-transparent bg-surface text-foreground',
                outline: 'border-border text-foreground',
                destructive: 'border-transparent bg-status-error text-white',
            },
        },
        defaultVariants: { variant: 'default' },
    });

    type Props = { children?: Snippet; class?: string; variant?: VariantProps<typeof badgeVariants>['variant'] };
    let { children, class: className, variant = 'default' }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)}>{@render children?.()}</span>
