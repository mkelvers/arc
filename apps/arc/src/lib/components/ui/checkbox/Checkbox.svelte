<script lang="ts">
    import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';

    interface Props extends Omit<HTMLInputAttributes, 'type' | 'checked'> {
        checked?: boolean;
        class?: string;
    }

    let { checked = $bindable(false), class: className, ...restProps }: Props = $props();
</script>

<span class="relative inline-flex size-4 shrink-0 items-center justify-center">
    <input
        {...restProps}
        bind:checked={checked}
        type="checkbox"
        class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
    />
    <span
        aria-hidden="true"
        class={cn(
            'flex size-4 items-center justify-center border border-border-strong bg-transparent text-input-accent transition-colors peer-hover:border-input-accent peer-checked:border-input-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-input-accent peer-checked:[&>svg]:opacity-100',
            className
        )}
    >
        <CheckIcon class="size-3 opacity-0 transition-opacity" weight="bold" />
    </span>
</span>
