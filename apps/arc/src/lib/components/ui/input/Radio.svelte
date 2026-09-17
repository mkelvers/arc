<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';
    import Input from './Input.svelte';

    interface Props extends HTMLInputAttributes {}

    let { class: className, ...props }: Props = $props();
</script>

<span
    class={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-white/55 bg-[#192e38] transition-[border-color] duration-150 ease-out before:size-1.5 before:scale-0 before:rounded-full before:bg-input-accent before:transition-transform before:duration-150 before:ease-out before:content-[''] has-checked:border-input-accent has-checked:before:scale-100 has-hover:border-input-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-input-accent has-disabled:cursor-not-allowed has-disabled:opacity-50 motion-reduce:transition-none motion-reduce:before:transition-none",
        className
    )}
>
    <Input {...props} type="radio" class={cn('absolute inset-0 z-10 cursor-pointer opacity-0', className)} />
</span>
