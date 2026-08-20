<script lang="ts">
    import { cn } from '$lib/utils';

    let { alt = '', class: className }: { alt?: string; class?: string } = $props();
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="2 3 38 33"
    fill="none"
    width="38"
    height="33"
    class={cn('h-8 w-auto shrink-0 text-accent', className)}
    role={alt ? 'img' : undefined}
    aria-label={alt || undefined}
    aria-hidden={alt ? undefined : 'true'}
>
    <g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="m4.5 33.5 12.75-28 12.5 28" stroke-width="5" />
        <path d="M8.25 28.5c7.5-5 16.2-8.35 26.1-10" stroke-width="3.25" />
    </g>
</svg>
