<script lang="ts">
    import Logo from '$lib/components/Logo.svelte';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-dvh flex-col bg-canvas text-foreground">
    <header class="h-14 shrink-0 bg-header">
        <div class="grid h-full place-items-center">
            <Logo alt="Arc" />
        </div>
    </header>

    <main class="flex flex-1 justify-center px-5 pt-20 sm:px-10 sm:pt-40">
        {@render children()}
    </main>
</div>
