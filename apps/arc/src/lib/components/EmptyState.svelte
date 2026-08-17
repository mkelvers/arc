<script lang="ts">
    interface Props {
        artwork: string;
        artworkHeight: number;
        artworkWidth: number;
        body: string;
        id: string;
        title?: string;
        actionHref?: string;
        actionLabel?: string;
    }

    let { artwork, artworkHeight, artworkWidth, body, id, title, actionHref, actionLabel }: Props = $props();
</script>

<section
    class="mt-10 grid min-h-128 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-12"
    aria-labelledby={title ? id : undefined}
    aria-describedby={title ? undefined : id}
>
    <div class="flex max-w-md flex-col items-center">
        <div class="grid size-72 place-items-center sm:size-80">
            <img
                src={artwork}
                alt=""
                width={artworkWidth}
                height={artworkHeight}
                class="max-h-full max-w-full object-contain"
            />
        </div>
        {#if title}
            <h2 id={id} class="mt-1 text-xl font-semibold">{title}</h2>
        {/if}
        <p id={title ? undefined : id} class="mt-2 max-w-md text-base leading-7 text-muted">{body}</p>
        {#if actionHref && actionLabel}
            <a
                href={actionHref}
                class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                {actionLabel}
            </a>
        {/if}
    </div>
</section>
