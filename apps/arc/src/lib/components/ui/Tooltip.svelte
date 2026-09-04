<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        text: string;
        children: Snippet;
        class?: string;
        placement?: 'top' | 'bottom';
        escapeOverflow?: boolean;
    }

    let { text, children, class: className, placement = 'top', escapeOverflow = false }: Props = $props();
    let trigger = $state<HTMLSpanElement>();
    let tooltipPosition = $state({ left: 0, bottom: 0 });
    let tooltipVisible = $state(false);

    function updateTooltipPosition() {
        if (!trigger) {
            return;
        }

        const bounds = trigger.getBoundingClientRect();
        tooltipPosition = {
            left: bounds.left + bounds.width / 2,
            bottom: window.innerHeight - bounds.top + 8,
        };
    }

    $effect(() => {
        if (!escapeOverflow) {
            return;
        }

        const update = () => {
            if (tooltipVisible) {
                updateTooltipPosition();
            }
        };
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);

        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    });
</script>

<span
    bind:this={trigger}
    role="group"
    class={cn('group/tooltip relative inline-flex', className)}
    onpointerenter={() => {
        tooltipVisible = true;
        if (escapeOverflow) {
            updateTooltipPosition();
        }
    }}
    onpointerleave={() => (tooltipVisible = false)}
    onfocusin={() => {
        tooltipVisible = true;
        if (escapeOverflow) {
            updateTooltipPosition();
        }
    }}
    onfocusout={() => (tooltipVisible = false)}
>
    {@render children()}
    <span
        class={cn(
            'pointer-events-none invisible z-50 flex justify-center opacity-0 transition-opacity duration-100 group-hover/tooltip:visible group-hover/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100',
            escapeOverflow ? 'fixed w-max -translate-x-1/2' : 'absolute inset-x-0',
            !escapeOverflow && (placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2')
        )}
        style={escapeOverflow ? `left:${tooltipPosition.left}px;bottom:${tooltipPosition.bottom}px` : undefined}
    >
        <span
            role="tooltip"
            class={cn(
                "relative inline-flex min-h-11 w-max items-center bg-tooltip px-3 text-[0.8125rem] leading-none font-normal whitespace-nowrap text-tooltip-foreground after:absolute after:inset-x-0 after:mx-auto after:w-0 after:border-7 after:border-transparent after:content-['']",
                placement === 'top'
                    ? 'after:top-full after:border-t-tooltip'
                    : 'after:bottom-full after:border-b-tooltip'
            )}
        >
            {text}
        </span>
    </span>
</span>
