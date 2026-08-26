<script lang="ts">
    import { m } from '$lib/paraglide/messages.js';
    import { CircleNotchIcon } from 'phosphor-svelte';
</script>

<main
    class="grid min-h-[calc(100dvh-3.5rem)] place-items-center bg-canvas text-foreground"
    aria-busy="true"
    aria-live="polite"
>
    <span class="sr-only">{m.navigation_loading()}</span>
    <CircleNotchIcon
        size="2.25rem"
        weight="bold"
        class="animate-spin text-accent motion-reduce:animate-none"
        aria-hidden="true"
    />
</main>
