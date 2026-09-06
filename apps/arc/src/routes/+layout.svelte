<script lang="ts">
    import { getTextDirection } from '$lib/paraglide/runtime.js';
    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import { locale } from '$lib/locale.svelte';
    import { m } from '$lib/i18n.svelte';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();

    $effect(() => {
        document.documentElement.lang = locale.current;
        document.documentElement.dir = getTextDirection(locale.current);
    });
</script>

<svelte:head>
    <link rel="icon" href={favicon} type="image/svg+xml" />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:site_name" content="Arc" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={data.canonical} />
    <meta property="og:title" content="Arc — Watch anime" />
    <meta property="og:description" content="Watch anime on Arc." />
    <meta name="twitter:card" content="summary" />
</svelte:head>

<a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-on-accent"
>
    {m.nav_skip_to_content()}
</a>

{@render children()}
