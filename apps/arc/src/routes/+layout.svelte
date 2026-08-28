<script lang="ts">
    import { getTextDirection } from '$lib/paraglide/runtime.js';
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import { locale } from '$lib/locale.svelte';
    import { m } from '$lib/paraglide/messages.js';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();

    $effect(() => {
        document.documentElement.lang = locale.current;
        document.documentElement.dir = getTextDirection(locale.current);
    });
</script>

<svelte:head>
    <link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

<a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-on-accent"
>
    {m.nav_skip_to_content()}
</a>

{@render children()}
