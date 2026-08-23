<script lang="ts">
    interface Props {
        pathname: string;
    }

    let { pathname }: Props = $props();
    const anime = $derived(pathname.startsWith('/anime/'));
</script>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground" aria-busy="true" aria-live="polite">
    <span class="sr-only">Loading page</span>
    {#if anime}
        <section
            class="grid h-[min(75dvh,48rem)] animate-pulse grid-cols-1 grid-rows-1 bg-black motion-reduce:animate-none"
            aria-hidden="true"
        >
            <div class="col-start-1 row-start-1 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-20">
                <div class="h-16 w-3/5 max-w-xl bg-surface/70"></div>
                <div class="mt-8 h-4 w-2/5 max-w-md bg-surface/70"></div>
                <div class="mt-7 h-10 w-48 bg-surface/70"></div>
            </div>
        </section>
    {:else}
        <section
            class="mx-auto w-full max-w-384 animate-pulse px-5 py-9 motion-reduce:animate-none sm:px-10 sm:py-11 lg:px-16 lg:py-14"
            aria-hidden="true"
        >
            <div class="h-8 w-48 bg-surface"></div>
            <div class="mt-8 h-12 border-b border-border"></div>
            <div
                class="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 2xl:gap-x-5"
            >
                {#each Array.from({ length: 12 }) as _}
                    <div>
                        <div class="aspect-2/3 bg-surface"></div>
                        <div class="mt-3 h-4 w-4/5 bg-surface"></div>
                        <div class="mt-2 h-3 w-2/5 bg-surface"></div>
                    </div>
                {/each}
            </div>
        </section>
    {/if}
</main>
