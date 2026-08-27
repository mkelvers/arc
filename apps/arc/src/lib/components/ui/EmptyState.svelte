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
    class="mt-8 grid min-h-112 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-10 sm:min-h-128"
    aria-labelledby={title ? id : undefined}
    aria-describedby={title ? undefined : id}
>
    <div class="flex max-w-md flex-col items-center">
        <div class="mb-5 grid w-60 place-items-center sm:w-72">
            <img
                src={artwork}
                alt=""
                width={artworkWidth}
                height={artworkHeight}
                class="block h-auto w-full object-contain"
            />
        </div>
        {#if title}
            <h2 id={id} class="text-xl font-bold sm:text-2xl">{title}</h2>
        {/if}
        <p
            id={title ? undefined : id}
            class="mt-2 max-w-md text-sm leading-6 text-muted sm:text-base sm:leading-7"
        >
            {body}
        </p>
        {#if actionHref && actionLabel}
            <a
                href={actionHref}
                class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
            >
                {actionLabel}
            </a>
        {/if}
    </div>
</section>
