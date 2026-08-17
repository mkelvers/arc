<script lang="ts">
    import { page } from '$app/state';
    import './layout.css';
    import favicon from '$lib/assets/favicon.ico';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<svelte:head>
    <title>{page.data.pageTitle ? `Arc — ${page.data.pageTitle}` : 'Arc'}</title>
    <link rel="icon" href={favicon} type="image/x-icon" sizes="16x16" />
</svelte:head>

{@render children()}
