<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';
    import Input from './Input.svelte';

    interface Props extends HTMLInputAttributes {}

    let { class: className, ...props }: Props = $props();
</script>

<span
    class={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center border border-border-strong bg-transparent text-input-accent transition-[background-color,border-color] duration-150 ease-out before:absolute before:top-[0.2rem] before:left-[0.3rem] before:h-2 before:w-1 before:rotate-45 before:scale-0 before:border-r-2 before:border-b-2 before:transition-transform before:duration-150 before:ease-out before:content-[''] has-checked:border-input-accent has-checked:bg-input-accent/10 has-checked:before:scale-100 has-hover:border-input-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-input-accent has-disabled:cursor-not-allowed has-disabled:opacity-50 motion-reduce:transition-none motion-reduce:before:transition-none",
        className
    )}
>
    <Input {...props} type="checkbox" class="absolute inset-0 z-10 cursor-pointer opacity-0" />
</span>
