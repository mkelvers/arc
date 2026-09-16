<script lang="ts">
    import type { Component, Snippet } from 'svelte';
    import type { HTMLButtonAttributes } from 'svelte/elements';
    import { cva, type VariantProps } from 'class-variance-authority';
    import { cn } from '..';

    const buttonVariants = cva(
        'group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none transition-colors select-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        {
            variants: {
                variant: {
                    default: '',
                    ghost: 'bg-transparent hover:bg-dropdown-hover',
                },
            },
            defaultVariants: {
                variant: 'default',
            },
        }
    );

    type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;

    type Props = HTMLButtonAttributes & {
        children?: Snippet;
    } & (
            | {
                  variant?: Exclude<ButtonVariant, 'ghost'>;
              }
            | {
                  variant: Extract<ButtonVariant, 'ghost'>;
                  icon?: Component;
              }
        );

    let {
        class: className,
        type = 'button',
        children,
        variant = 'default',
        icon: Icon,
        ...props
    }: Props & {
        icon?: Component;
    } = $props();
</script>

<button class={cn(buttonVariants({ variant }), className)} type={type} {...props}>
    {#if Icon}
        <span aria-hidden="true" class="inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
            <Icon />
        </span>
    {/if}

    {@render children?.()}
</button>
