<script lang="ts" module>
    import type { Snippet } from 'svelte';
    import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
    import { cva, type VariantProps } from 'class-variance-authority';

    import { cn } from '$lib/utils';

    export const buttonVariants = cva(
        'group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-transparent text-sm font-medium outline-none transition-[background-color,border-color,color,filter,opacity,transform] select-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        {
            variants: {
                variant: {
                    default: 'bg-accent text-on-accent hover:brightness-110',
                    outline: 'border-border bg-transparent hover:bg-surface hover:text-foreground',
                    secondary: 'bg-surface text-foreground hover:bg-panel',
                    ghost: 'border-transparent bg-transparent hover:bg-surface hover:text-foreground',
                    unstyled: 'border-0 bg-transparent font-normal text-inherit',
                    destructive: 'bg-status-error text-white hover:brightness-110',
                    link: 'border-transparent bg-transparent text-accent underline-offset-4 hover:underline',
                },
                size: {
                    default: 'h-9 px-2.5',
                    sm: 'h-8 px-2.5 text-xs',
                    lg: 'h-11 px-4',
                    icon: 'size-9',
                    'icon-sm': 'size-8',
                    'icon-lg': 'size-11',
                },
            },
            defaultVariants: {
                variant: 'default',
                size: 'default',
            },
        }
    );

    export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
    export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
    export type ButtonProps = HTMLButtonAttributes &
        HTMLAnchorAttributes & {
            children?: Snippet;
            ref?: HTMLButtonElement | HTMLAnchorElement | null;
            variant?: ButtonVariant;
            size?: ButtonSize;
        };
</script>

<script lang="ts">
    let {
        class: className,
        variant = 'default',
        size = 'default',
        href,
        type = 'button',
        disabled = false,
        children,
        ref = $bindable(null),
        ...restProps
    }: ButtonProps = $props();
</script>

{#if href != null}
    <a
        bind:this={ref}
        class={cn(buttonVariants({ variant, size }), className)}
        href={href}
        aria-disabled={disabled || undefined}
        tabindex={disabled ? -1 : undefined}
        {...restProps}
    >
        {@render children?.()}
    </a>
{:else}
    <button
        bind:this={ref}
        class={cn(buttonVariants({ variant, size }), className)}
        type={type}
        disabled={disabled}
        {...restProps}
    >
        {@render children?.()}
    </button>
{/if}
