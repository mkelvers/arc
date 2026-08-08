<script lang="ts">
  import { page } from '$app/state';
  import './layout.css';
  import favicon from '$lib/assets/favicon.ico';

  let { children } = $props();
  const title = $derived(page.data.pageTitle ? `Arc — ${page.data.pageTitle}` : 'Arc');
</script>

<svelte:head>
  <title>{title}</title>
  <link rel="icon" href={favicon} type="image/png" sizes="512x512" />
  <link rel="apple-touch-icon" href={favicon} />
</svelte:head>

{@render children()}
