<script lang="ts">
    import Autoplay from 'embla-carousel-autoplay';
    import type { EmblaCarouselType } from 'embla-carousel';
    import useEmblaCarousel from 'embla-carousel-svelte';
    import type { Snippet } from 'svelte';
    import { prefersReducedMotion } from 'svelte/motion';
    import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
    import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
    import { cn } from '$lib/utils';
    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';

    interface CarouselState {
        active: number;
        previous: number | null;
        paused: boolean;
        select: (index: number, instant?: boolean) => void;
    }

    interface Props {
        children: Snippet<[state: CarouselState]>;
        class?: string;
        autoplay?: number;
        controls?: boolean;
    }

    let { children, class: className, autoplay, controls = false }: Props = $props();

    let emblaApi = $state<EmblaCarouselType>();
    let active = $state(0);
    let previous = $state<number | null>(null);
    let paused = $state(false);

    const plugins = $derived(
        autoplay === undefined
            ? []
            : [
                  Autoplay({
                      delay: autoplay,
                      jump: true,
                      stopOnMouseEnter: true,
                      stopOnFocusIn: true,
                      stopOnInteraction: false,
                  }),
              ]
    );

    function init({ detail: api }: CustomEvent<EmblaCarouselType>) {
        emblaApi = api;

        const autoplayApi = api.plugins().autoplay;
        if (prefersReducedMotion.current || api.scrollSnapList().length < 2) {
            autoplayApi?.stop();
        }

        api.on('select', () => {
            const next = api.selectedScrollSnap();
            if (next !== active) {
                previous = prefersReducedMotion.current ? null : active;
                active = next;
            }
        });
        api.on('reInit', () => (emblaApi = api));
        api.on('resize', () => (emblaApi = api));
        api.on('slidesChanged', () => (emblaApi = api));
        api.on('autoplay:play', () => (paused = false));
        api.on('autoplay:stop', () => (paused = true));

        paused = !autoplayApi?.isPlaying();
        active = api.selectedScrollSnap();
    }

    function select(index: number, instant = false) {
        if (!emblaApi) {
            return;
        }

        const total = emblaApi.scrollSnapList().length;
        if (total) {
            emblaApi.scrollTo(((index % total) + total) % total, instant);
        }
    }
</script>

<section class={cn('relative', className)}>
    <div
        class="relative h-full overflow-hidden"
        onemblaInit={init}
        use:useEmblaCarousel={{
            options: {
                loop: autoplay !== undefined,
                slidesToScroll: autoplay === undefined ? 'auto' : 1,
            },
            plugins,
        }}
    >
        {@render children({
            active,
            previous,
            paused: paused || prefersReducedMotion.current,
            select,
        })}
    </div>

    {#if controls && emblaApi?.canScrollPrev()}
        <Button
            variant="unstyled"
            type="button"
            class="absolute top-1/2 left-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
            aria-label={m.shared_previous()}
            onclick={() => emblaApi?.scrollPrev()}
        >
            <CaretLeftIcon size="1.65rem" weight="bold" aria-hidden="true" />
        </Button>
    {/if}

    {#if controls && emblaApi?.canScrollNext()}
        <Button
            variant="unstyled"
            type="button"
            class="absolute top-1/2 right-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
            aria-label={m.shared_next()}
            onclick={() => emblaApi?.scrollNext()}
        >
            <CaretRightIcon size="1.65rem" weight="bold" aria-hidden="true" />
        </Button>
    {/if}
</section>
