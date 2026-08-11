<script lang="ts">
    import { page } from '$app/state';

    let { children } = $props();
    const manage = $derived(page.url.pathname === '/manage');
    const settings = $derived(page.url.pathname.startsWith('/settings'));
</script>

{@render children()}
