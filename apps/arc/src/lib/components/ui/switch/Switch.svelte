<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        checked?: boolean;
        class?: string;
        disabled?: boolean;
        'aria-label'?: string;
        onchange?: (checked: boolean) => void;
    }

    let {
        checked = $bindable(false),
        class: className,
        disabled = false,
        'aria-label': ariaLabel,
        onchange,
    }: Props = $props();

    function toggle() {
        if (disabled) {
            return;
        }

        checked = !checked;
        onchange?.(checked);
    }
</script>

<button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    class={cn(
        'relative h-3.5 w-7 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-input-accent bg-input-accent/20' : 'border-border-strong bg-transparent',
        className
    )}
    onclick={toggle}
>
    <span
        aria-hidden="true"
        class={cn(
            'absolute top-0.5 left-0.5 size-2 rounded-full transition-[transform,background-color]',
            checked ? 'translate-x-4 bg-input-accent' : 'bg-muted'
        )}
    ></span>
</button>
