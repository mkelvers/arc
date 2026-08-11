<script lang="ts">
    import type { Snippet } from 'svelte';

    let { title, synopsis, children }: { title: string; synopsis: string; children: Snippet } =
        $props();
</script>

<section
    class="h-fit min-w-0 self-start bg-panel px-7 py-8 md:px-10 md:py-10"
    aria-labelledby="settings-title"
>
    <header class="text-center">
        <h1 id="settings-title" class="text-2xl font-bold tracking-tight">{title}</h1>
        <p class="mt-2 text-base text-muted">{synopsis}</p>
    </header>

    <div class="mt-8">
        {@render children()}
    </div>
</section>
