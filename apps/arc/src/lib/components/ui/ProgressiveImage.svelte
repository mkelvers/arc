<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        src: string;
        alt: string;
        previewSize?: 'w92' | 'w300';
        class?: string;
        imageClass?: string;
        loading?: 'eager' | 'lazy';
        previewLoading?: 'eager' | 'lazy';
        fetchpriority?: 'high' | 'low' | 'auto';
        displaySize?: 'w342' | 'w500' | 'w780';
        sizes?: string;
        loadFull?: boolean;
        ontransitionend?: (event: TransitionEvent) => void;
        onready?: () => void;
    }

    let {
        src,
        alt,
        previewSize = 'w92',
        class: className,
        imageClass,
        loading = 'lazy',
        previewLoading = loading,
        fetchpriority = 'auto',
        displaySize,
        sizes,
        loadFull = true,
        ontransitionend,
        onready,
    }: Props = $props();

    let loadedSrc = $state<string | null>(null);
    let imageFailed = $state(false);
    let previewFailed = $state(false);
    const displaySrc = $derived(
        displaySize ? src.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+(?=\/|$)/, `$1${displaySize}`) : src
    );
    const preview = $derived(src.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+(?=\/|$)/, `$1${previewSize}`));
    const displaySrcSet = $derived(
        displaySize
            ? [displaySize === 'w342' ? 'w185' : 'w342', displaySize]
                  .map(
                      (size) =>
                          `${src.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+(?=\/|$)/, `$1${size}`)} ${size.slice(1)}w`
                  )
                  .join(', ')
            : undefined
    );
    const ready = $derived(loadedSrc === displaySrc);
</script>

<div class={cn('relative size-full overflow-hidden', className)} ontransitionend={ontransitionend}>
    <div
        class="absolute inset-0 bg-surface transition-opacity duration-300"
        class:opacity-0={ready || imageFailed}
        aria-hidden={imageFailed || undefined}
    >
        {#if !previewFailed}
            <img
                src={preview}
                alt=""
                class={cn('size-full scale-110 object-cover blur-xl', imageClass)}
                loading={previewLoading}
                aria-hidden="true"
                onerror={() => (previewFailed = true)}
            />
        {/if}
    </div>
    {#if loadFull && !imageFailed}
        <img
            src={displaySrc}
            srcset={displaySrcSet}
            sizes={sizes}
            alt={alt}
            class={cn(
                'absolute inset-0 size-full object-cover transition-opacity duration-300',
                imageClass,
                ready ? 'opacity-100' : 'opacity-0'
            )}
            loading={loading}
            fetchpriority={fetchpriority}
            onload={() => {
                loadedSrc = displaySrc;
                onready?.();
            }}
            onerror={() => (imageFailed = true)}
        />
    {:else if imageFailed}
        <div
            class="absolute inset-0 grid place-items-center bg-surface"
            role={alt ? 'img' : undefined}
            aria-label={alt || undefined}
            aria-hidden={alt ? undefined : 'true'}
        ></div>
    {/if}
</div>
