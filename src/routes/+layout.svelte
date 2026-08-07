<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.ico';

  let { children } = $props();
</script>

<svelte:head>
  <title>Arc</title>
  <link rel="icon" href={favicon} type="image/png" sizes="512x512" />
  <link rel="apple-touch-icon" href={favicon} />
</svelte:head>

{@render children()}
