<script lang="ts">
    import './layout.css';
    import favicon from '$lib/assets/favicon.ico';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} type="image/x-icon" sizes="16x16" />
</svelte:head>

{@render children()}
