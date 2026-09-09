<script lang="ts">
    import { type AnimePageDeferred } from '@arc/core/client';

    import Button from '$lib/components/ui/button/button.svelte';
    import { cn } from '$lib/utils';
    import { m } from '$lib/i18n.svelte';

    type Props = { anime: AnimePageDeferred['anime'] };

    let { anime }: Props = $props();
    let expanded = $state(false);
</script>

<div class="relative z-20 bg-canvas px-5 sm:px-10 lg:px-16">
    <div class="border-b border-border pt-7 lg:pt-8">
        <div
            class={cn(
                'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
        >
            <section
                id="anime-details"
                class={cn(
                    'grid min-h-24 min-w-0 max-w-432 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-2 md:gap-12 lg:gap-28 lg:text-sm lg:leading-6',
                    !expanded && 'mask-[linear-gradient(to_bottom,black_45%,transparent_100%)]'
                )}
            >
                <p class="max-w-3xl text-foreground">{anime.description}</p>
                <div class="space-y-3">
                    {#if anime.studios.length}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_production()}</strong>
                            {anime.studios.join(', ')}
                        </p>
                    {/if}
                    {#if anime.staff}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_key_staff()}</strong>
                            {anime.staff}
                        </p>
                    {/if}
                    {#if anime.rankings.length}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_rankings()}</strong>
                            {anime.rankings.join(', ')}
                        </p>
                    {/if}
                    {#if anime.members !== '0' || anime.favourites !== '0'}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_audience()}</strong>
                            {m.anime_members_favorites({
                                members: anime.members,
                                favorites: anime.favourites,
                            })}
                        </p>
                    {/if}
                    {#if anime.startDate || anime.endDate}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_aired()}</strong>
                            {anime.startDate ?? '?'}{anime.endDate ? ` – ${anime.endDate}` : ''}
                        </p>
                    {/if}
                    {#if anime.themes.length}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_themes()}</strong>
                            {anime.themes.join(', ')}
                        </p>
                    {/if}
                    {#if anime.genres.length}
                        <p>
                            <strong class="font-normal text-foreground">{m.anime_genres()}</strong>
                            {#each anime.genres as genre, index}
                                {#if index > 0}
                                    <span aria-hidden="true">,</span>
                                {/if}
                                {#if anime.scoreSource === 'Kitsu'}
                                    <span>{genre}</span>
                                {:else}
                                    <a
                                        class="underline underline-offset-2"
                                        href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                    >
                                        {genre}
                                    </a>
                                {/if}
                            {/each}
                        </p>
                    {/if}
                </div>
            </section>
        </div>

        <Button
            variant="unstyled"
            type="button"
            class="min-h-11 text-xs font-semibold text-accent uppercase"
            aria-expanded={expanded}
            aria-controls="anime-details"
            onclick={() => (expanded = !expanded)}
        >
            {expanded ? m.anime_fewer_details() : m.anime_more_details()}
        </Button>
    </div>
</div>
