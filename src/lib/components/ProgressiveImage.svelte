<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        src: string;
        alt: string;
        previewSrc?: string;
        previewSize?: 'w92' | 'w300';
        class?: string;
        imageClass?: string;
        loading?: 'eager' | 'lazy';
        fetchpriority?: 'high' | 'low' | 'auto';
        ontransitionend?: (event: TransitionEvent) => void;
    }

    let {
        src,
        alt,
        previewSrc,
        previewSize = 'w92',
        class: className,
        imageClass,
        loading = 'lazy',
        fetchpriority = 'auto',
        ontransitionend,
    }: Props = $props();

    let loadedSrc = $state<string | null>(null);
    const preview = $derived(
        previewSrc ?? src.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+(?=\/|$)/, `$1${previewSize}`)
    );
    const ready = $derived(loadedSrc === src);
</script>

<figure
    class={cn('relative size-full overflow-hidden', className)}
    ontransitionend={ontransitionend}
>
    <div class="absolute inset-0 transition-opacity duration-300" class:opacity-0={ready}>
        <picture>
            <img
                src={preview}
                alt=""
                class={cn('size-full scale-110 object-cover blur-xl', imageClass)}
                loading={loading}
                aria-hidden="true"
            />
        </picture>
    </div>
    <picture>
        <img
            src={src}
            alt={alt}
            class={cn(
                'absolute inset-0 size-full object-cover transition-opacity duration-300',
                imageClass,
                ready ? 'opacity-100' : 'opacity-0'
            )}
            loading={loading}
            fetchpriority={fetchpriority}
            onload={() => (loadedSrc = src)}
        />
    </picture>
</figure>
