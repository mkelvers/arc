<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        src: string;
        alt: string;
        class?: string;
        imageClass?: string;
        loading?: 'eager' | 'lazy';
        previewLoading?: 'eager' | 'lazy';
        fetchpriority?: 'high' | 'low' | 'auto';
        displaySize?: 'w342' | 'w500' | 'w780' | 'w1280';
        sizes?: string;
        ontransitionend?: (event: TransitionEvent) => void;
        onready?: () => void;
    }

    let {
        src,
        alt,
        class: className,
        imageClass,
        loading = 'lazy',
        previewLoading = loading,
        fetchpriority = 'auto',
        displaySize,
        sizes,
        ontransitionend,
        onready,
    }: Props = $props();

    let element = $state<HTMLDivElement>();
    let visible = $state(false);
    let loaded = $state('');
    let failed = $state('');
    const fullSrc = $derived(
        displaySize ? src.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+(?=\/|$)/, `$1${displaySize}`) : src
    );
    const previewSrc = $derived(
        src
            .replace(/(\/image\.tmdb\.org\/t\/p\/)(?:original|w\d+)(?=\/|$)/, '$1w300')
            .replace(/(\/anilistcdn\/media\/anime\/cover\/)(?:extraLarge|large)(?=\/|$)/, '$1medium')
    );
    const fullSrcSet = $derived(
        displaySize
            ? [displaySize === 'w342' ? 'w185' : displaySize === 'w1280' ? 'w780' : 'w342', displaySize]
                  .map(
                      (size) =>
                          `${src.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+(?=\/|$)/, `$1${size}`)} ${size.slice(1)}w`
                  )
                  .join(', ')
            : undefined
    );

    $effect(() => {
        if (!element || loading === 'eager' || visible) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    visible = true;
                    observer.disconnect();
                }
            },
            { rootMargin: '160px 0px' }
        );
        observer.observe(element);

        return () => observer.disconnect();
    });
</script>

<div
    bind:this={element}
    class={cn('relative size-full overflow-hidden', className)}
    ontransitionend={ontransitionend}
>
    <div
        class="absolute inset-0 bg-surface transition-opacity duration-300"
        class:opacity-0={loaded === fullSrc}
        aria-hidden={loaded === fullSrc || undefined}
    >
        {#if previewSrc !== fullSrc}
            <img
                src={previewSrc}
                alt=""
                class={cn('size-full scale-110 object-cover blur-xl', imageClass)}
                loading={previewLoading}
                decoding="async"
                aria-hidden="true"
                onload={(event) => {
                    if (event.currentTarget instanceof HTMLImageElement) {
                        event.currentTarget.hidden = false;
                    }
                }}
                onerror={(event) => {
                    if (event.currentTarget instanceof HTMLImageElement) {
                        event.currentTarget.hidden = true;
                    }
                }}
            />
        {/if}
    </div>
    {#if (loading === 'eager' || visible) && failed !== fullSrc}
        <img
            src={fullSrc}
            srcset={fullSrcSet}
            sizes={sizes}
            alt={alt}
            class={cn(
                'absolute inset-0 size-full object-cover transition-opacity duration-300',
                imageClass,
                loaded === fullSrc ? 'opacity-100' : 'opacity-0'
            )}
            loading={loading}
            fetchpriority={fetchpriority}
            decoding="async"
            onload={() => {
                loaded = fullSrc;
                onready?.();
            }}
            onerror={() => {
                failed = fullSrc;
                loaded = '';
            }}
        />
    {/if}
</div>
