<script lang="ts">
    import logo from '$lib/assets/logo.svg';
    import { cn } from '$lib/utils';

    let { alt = '', class: className }: { alt?: string; class?: string } = $props();
</script>

<img
    src={logo}
    alt={alt}
    width="38"
    height="33"
    class={cn('h-8 w-auto shrink-0', className)}
    aria-hidden={alt ? undefined : 'true'}
/>
