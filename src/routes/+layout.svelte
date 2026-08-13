<script lang="ts">
    import { page } from '$app/state';
    import './layout.css';
    import favicon from '$lib/assets/favicon.ico';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<svelte:head>
    <title>{page.data.pageTitle ? `Arc — ${page.data.pageTitle}` : 'Arc'}</title>
    <link rel="icon" href={favicon} type="image/png" sizes="512x512" />
    <link rel="apple-touch-icon" href={favicon} />
</svelte:head>

{@render children()}
