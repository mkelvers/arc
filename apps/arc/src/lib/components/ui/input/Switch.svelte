<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';
    import Input from './Input.svelte';

    interface Props extends HTMLInputAttributes {}

    let { class: className, ...props }: Props = $props();
</script>

<span
    class={cn(
        "relative inline-flex h-3.5 w-7 shrink-0 items-center rounded-full border border-white/55 bg-white/12 transition-[background-color,border-color] duration-200 ease-out before:absolute before:top-0.5 before:left-0.5 before:size-2 before:rounded-full before:bg-white before:transition-[background-color,transform] before:duration-200 before:ease-out before:content-[''] has-checked:border-input-accent has-checked:bg-input-accent/20 has-checked:before:translate-x-3.5 has-checked:before:bg-input-accent has-hover:border-input-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-input-accent has-disabled:cursor-not-allowed has-disabled:opacity-50 motion-reduce:transition-none motion-reduce:before:transition-none",
        className
    )}
>
    <Input {...props} type="checkbox" class="absolute inset-0 z-10 cursor-pointer opacity-0" />
</span>
