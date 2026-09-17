<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        artwork: string;
        artworkHeight: number;
        artworkWidth: number;
        body: string;
        id: string;
        title?: string;
        action?: Snippet;
    }

    let { artwork, artworkHeight, artworkWidth, body, id, title, action }: Props = $props();
</script>

<section
    class="mt-8 grid min-h-112 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-10 sm:min-h-128"
    aria-labelledby={title ? id : undefined}
    aria-describedby={title ? undefined : id}
>
    <div class="flex max-w-md flex-col items-center space-y-5">
        <img src={artwork} alt="" width={artworkWidth} height={artworkHeight} class="h-auto w-60 sm:w-72" />
        {#if title}
            <h2 id={id} class="text-xl font-bold sm:text-2xl">{title}</h2>
        {/if}
        <p id={title ? undefined : id} class="text-sm leading-6 text-muted sm:text-base sm:leading-7">
            {body}
        </p>
        {#if action}
            <div>
                {@render action()}
            </div>
        {/if}
    </div>
</section>
