<script lang="ts">
    const topResults = Array.from({ length: 3 });
    const sectionResults = Array.from({ length: 6 });
</script>

<section aria-label="Searching" aria-live="polite">
    <span class="sr-only">Searching for anime</span>
    <div class="animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <h1 class="mb-4 text-xl font-bold">Top Results</h1>
        <div class="grid gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {#each topResults as _, index (index)}
                <div>
                    <div class="aspect-video bg-surface"></div>
                    <div class="mt-3 h-4 w-3/4 bg-surface"></div>
                    <div class="mt-2 h-4 w-2/5 bg-surface"></div>
                </div>
            {/each}
        </div>

        {#each ['Series', 'Movies'] as title}
            <section class="mt-10">
                <h2 class="mb-3 text-xl font-bold">{title}</h2>
                <div class="-mx-2 grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {#each sectionResults as _, index (index)}
                        <div class="flex min-h-28 gap-3 p-2">
                            <div class="aspect-2/3 h-24 shrink-0 bg-surface"></div>
                            <div class="min-w-0 flex-1 py-1">
                                <div class="h-4 w-4/5 bg-surface"></div>
                                <div class="mt-2 h-3 w-3/5 bg-surface"></div>
                                <div class="mt-8 h-4 w-2/5 bg-surface"></div>
                            </div>
                        </div>
                    {/each}
                </div>
            </section>
        {/each}
    </div>
</section>
