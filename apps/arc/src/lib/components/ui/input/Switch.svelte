<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';
    import { cn } from '$lib/utils';
    import Input from './Input.svelte';

    interface Props extends HTMLInputAttributes {}

    let { class: className, ...props }: Props = $props();
</script>

<span
    class={cn(
        "relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border-2 border-white/55 bg-[#192e38] transition-[border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] before:absolute before:top-0.5 before:left-0.5 before:size-2 before:rounded-full before:bg-white/70 before:transition-[background-color,translate] before:duration-200 before:ease-[cubic-bezier(0.23,1,0.32,1)] before:content-[''] has-checked:border-input-accent has-checked:before:translate-x-4 has-checked:before:bg-input-accent has-hover:border-input-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-input-accent has-disabled:cursor-not-allowed has-disabled:opacity-50 motion-reduce:transition-none motion-reduce:before:transition-none",
        className
    )}
>
    <Input {...props} type="checkbox" class="absolute inset-0 z-10 cursor-pointer opacity-0" />
</span>
