<script lang="ts">
    import { onMount } from 'svelte';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import type { AnimeCardItem } from '$lib/components/AnimeCard.svelte';
    import { locale } from '$lib/locale.svelte';
    import { localReleaseTime, releaseCalendarWeek } from '$lib/release-calendar';
    import { m } from '$lib/i18n.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let timezone = $state<string | null>(null);
    let calendar = $state<HTMLDivElement>();
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);
    let days = $derived(timezone ? releaseCalendarWeek(data.events, timezone, locale.current) : []);

    function calendarAnime(event: (typeof data.events)[number]): AnimeCardItem {
        return {
            id: event.anilistId,
            href: `/anime/${event.anilistId}`,
            link: `/anime/${event.anilistId}`,
            title: event.title,
            image: event.image ?? '',
            audioLabel: '',
            score: 0,
            genres: [],
            synopsis: event.synopsis ?? '',
            episode: event.episode,
        };
    }

    onMount(() => {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    });

    function updateScroll() {
        if (!calendar) {
            return;
        }

        canScrollLeft = calendar.scrollLeft > 2;
        canScrollRight = calendar.scrollLeft + calendar.clientWidth < calendar.scrollWidth - 2;
    }

    function scrollCalendar(direction: -1 | 1) {
        calendar?.scrollBy({
            left: direction * Math.max(128, calendar.clientWidth * 0.8),
            behavior: 'smooth',
        });
    }

    $effect(() => {
        if (!calendar) {
            return;
        }

        updateScroll();
        const observer = new ResizeObserver(updateScroll);
        observer.observe(calendar);
        return () => observer.disconnect();
    });
</script>

<svelte:head>
    <title>Arc — {m.release_calendar_title()}</title>
    <meta name="description" content={m.release_calendar_title()} />
</svelte:head>

<main class="min-h-dvh overflow-x-clip bg-canvas px-2 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
    <section class="mx-auto w-full max-w-7xl" aria-labelledby="release-calendar-title">
        <div class="mb-8">
            <h1 id="release-calendar-title" class="text-xl font-bold sm:text-2xl">
                {m.release_calendar_title()}
            </h1>
        </div>

        {#if timezone}
            <div class="relative">
                <div
                    bind:this={calendar}
                    id="release-calendar-scroller"
                    aria-label={m.release_calendar_title()}
                    role="region"
                    onscroll={updateScroll}
                    class="min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
                >
                    <div
                        class="grid w-max min-w-max grid-cols-[repeat(7,8rem)] gap-x-3 gap-y-8 sm:w-full sm:min-w-0 sm:grid-cols-7 sm:gap-x-4 sm:gap-y-10 lg:gap-x-7.5 lg:gap-y-12"
                    >
                        {#each days as day, dayIndex}
                            {@const column = dayIndex + 1}
                            <section class="contents" aria-labelledby={`day-${day.key}`}>
                                <h2
                                    id={`day-${day.key}`}
                                    class="min-w-0 px-1 pb-5 text-center text-sm leading-tight font-bold text-muted uppercase sm:pb-6 sm:text-base"
                                    style={`grid-column: ${column}; grid-row: 1;`}
                                >
                                    {#if day.today}
                                        {m.release_calendar_today()}
                                    {:else}
                                        <span class="block text-xs sm:text-sm">{day.dateLabel}</span>
                                        <span class="block">{day.weekdayLabel}</span>
                                    {/if}
                                </h2>
                                {#each day.events as event, eventIndex (event.airingId)}
                                    {@const time = localReleaseTime(event.airingAt, timezone, locale.current)}
                                    <div
                                        class="min-w-0 px-1 pb-3 sm:px-2 sm:pb-4"
                                        style={`grid-column: ${column}; grid-row: ${eventIndex + 2};`}
                                    >
                                        <AnimeCard
                                            anime={calendarAnime(event)}
                                            meta={`${m.release_calendar_episode({ episode: event.episode })} · ${time}`}
                                            reserveTitleSpace={false}
                                            truncateTitle={false}
                                        />
                                    </div>
                                {:else}
                                    <p
                                        class="min-w-0 px-1 text-center text-xs text-subtle"
                                        style={`grid-column: ${column}; grid-row: 2;`}
                                    >
                                        {m.release_calendar_empty()}
                                    </p>
                                {/each}
                            </section>
                        {/each}
                    </div>
                </div>
                {#if canScrollLeft}
                    <button
                        type="button"
                        class="absolute top-1/2 left-0 z-10 grid size-10 -translate-y-1/2 place-items-center bg-canvas/85 text-foreground shadow-lg transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
                        aria-label={m.shared_previous()}
                        aria-controls="release-calendar-scroller"
                        onclick={() => scrollCalendar(-1)}
                    >
                        <CaretLeftIcon size="1.25rem" weight="bold" aria-hidden="true" />
                    </button>
                {/if}
                {#if canScrollRight}
                    <button
                        type="button"
                        class="absolute top-1/2 right-0 z-10 grid size-10 -translate-y-1/2 place-items-center bg-canvas/85 text-foreground shadow-lg transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
                        aria-label={m.shared_next()}
                        aria-controls="release-calendar-scroller"
                        onclick={() => scrollCalendar(1)}
                    >
                        <CaretRightIcon size="1.25rem" weight="bold" aria-hidden="true" />
                    </button>
                {/if}
            </div>
        {:else}
            <div
                class="min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
                aria-busy="true"
            >
                <div
                    class="grid w-max min-w-max grid-cols-[repeat(7,8rem)] gap-x-3 sm:w-full sm:min-w-0 sm:grid-cols-7 sm:gap-x-4 lg:gap-x-6"
                >
                    {#each Array(7) as _}
                        <div class="min-h-48 sm:min-h-64"></div>
                    {/each}
                </div>
            </div>
            <p class="sr-only" aria-live="polite">{m.release_calendar_loading()}</p>
        {/if}
    </section>
</main>
