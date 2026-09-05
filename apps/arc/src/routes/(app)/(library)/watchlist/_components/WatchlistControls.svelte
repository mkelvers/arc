<script lang="ts">
    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';
    import { cn } from '$lib/utils';
    import type { PageData } from '../$types';

    type Selection = PageData['selection'];

    interface Props {
        selection: Selection;
        totalEntries: number;
        onselect: (patch: Partial<Selection>) => void | Promise<void>;
    }

    let { selection, totalEntries, onselect }: Props = $props();
</script>

<div class="mt-8 flex min-w-0 flex-wrap items-end gap-x-2 border-b border-border sm:mt-10 sm:flex-nowrap">
    <label class="min-w-0 flex-1 sm:hidden">
        <span class="sr-only">{m.watchlist_statuses()}</span>
        <select
            value={selection.state}
            aria-label={m.watchlist_statuses()}
            class="h-12 w-full min-w-0 appearance-none bg-transparent px-1 text-sm font-medium text-foreground uppercase outline-none"
            onchange={(event) => onselect({ state: event.currentTarget.value as Selection['state'] })}
        >
            <option value="all">{m.watchlist_all()}</option>
            <option value="watching">{m.watchlist_watching()}</option>
            <option value="plan_to_watch">{m.watchlist_plan()}</option>
            <option value="completed">{m.watchlist_completed()}</option>
            <option value="dropped">{m.watchlist_dropped()}</option>
        </select>
    </label>

    <nav
        class="scrollbar-hidden hidden min-w-0 flex-1 overflow-x-auto sm:block"
        aria-label={m.watchlist_statuses()}
    >
        <ul class="-mb-px flex min-w-max gap-5 sm:gap-7">
            <li>
                <Button
                    variant="ghost"
                    size="lg"
                    class={cn(
                        'h-12 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        selection.state === 'all' && 'border-accent text-foreground'
                    )}
                    aria-pressed={selection.state === 'all'}
                    onclick={() => onselect({ state: 'all' })}
                >
                    {m.watchlist_all()}
                </Button>
            </li>
            <li>
                <Button
                    variant="ghost"
                    size="lg"
                    class={cn(
                        'h-12 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        selection.state === 'watching' && 'border-accent text-foreground'
                    )}
                    aria-pressed={selection.state === 'watching'}
                    onclick={() => onselect({ state: 'watching' })}
                >
                    {m.watchlist_watching()}
                </Button>
            </li>
            <li>
                <Button
                    variant="ghost"
                    size="lg"
                    class={cn(
                        'h-12 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        selection.state === 'plan_to_watch' && 'border-accent text-foreground'
                    )}
                    aria-pressed={selection.state === 'plan_to_watch'}
                    onclick={() => onselect({ state: 'plan_to_watch' })}
                >
                    {m.watchlist_plan()}
                </Button>
            </li>
            <li>
                <Button
                    variant="ghost"
                    size="lg"
                    class={cn(
                        'h-12 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        selection.state === 'completed' && 'border-accent text-foreground'
                    )}
                    aria-pressed={selection.state === 'completed'}
                    onclick={() => onselect({ state: 'completed' })}
                >
                    {m.watchlist_completed()}
                </Button>
            </li>
            <li>
                <Button
                    variant="ghost"
                    size="lg"
                    class={cn(
                        'h-12 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        selection.state === 'dropped' && 'border-accent text-foreground'
                    )}
                    aria-pressed={selection.state === 'dropped'}
                    onclick={() => onselect({ state: 'dropped' })}
                >
                    {m.watchlist_dropped()}
                </Button>
            </li>
        </ul>
    </nav>

    {#if totalEntries > 0}
        <div class="mb-2 ml-auto flex flex-wrap items-center justify-end gap-2 sm:ml-3 sm:flex-nowrap">
            <label>
                <span class="sr-only">{m.settings_subtitles()}</span>
                <select
                    value={selection.language}
                    aria-label={m.settings_subtitles()}
                    class="h-10 max-w-32 appearance-none bg-transparent px-2 text-xs font-bold text-muted uppercase outline-none hover:text-foreground"
                    onchange={(event) =>
                        onselect({ language: event.currentTarget.value as Selection['language'] })}
                >
                    <option value="all">{m.watchlist_all()}</option>
                    <option value="sub">{m.watchlist_subtitled()}</option>
                    <option value="dub">{m.watchlist_dubbed()}</option>
                </select>
            </label>
            <label>
                <span class="sr-only">{m.watchlist_type()}</span>
                <select
                    value={selection.media}
                    aria-label={m.watchlist_type()}
                    class="h-10 max-w-32 appearance-none bg-transparent px-2 text-xs font-bold text-muted uppercase outline-none hover:text-foreground"
                    onchange={(event) => onselect({ media: event.currentTarget.value as Selection['media'] })}
                >
                    <option value="all">{m.watchlist_all()}</option>
                    <option value="series">{m.watchlist_series()}</option>
                    <option value="movie">{m.watchlist_movies()}</option>
                </select>
            </label>
            <label>
                <span class="sr-only">{m.watchlist_type()}</span>
                <select
                    value={selection.type}
                    aria-label={m.watchlist_type()}
                    class="h-10 max-w-40 appearance-none bg-transparent px-2 text-xs font-bold text-muted uppercase outline-none hover:text-foreground"
                    onchange={(event) => onselect({ type: event.currentTarget.value as Selection['type'] })}
                >
                    <option value="all">{m.watchlist_all()}</option>
                    <option value="airing">{m.watchlist_airing()}</option>
                    <option value="finished">{m.watchlist_finished()}</option>
                    <option value="not_yet_released">{m.watchlist_not_released()}</option>
                    <option value="cancelled">{m.watchlist_cancelled()}</option>
                    <option value="hiatus">{m.watchlist_hiatus()}</option>
                </select>
            </label>
            <label>
                <span class="sr-only">{m.watchlist_sorting()}</span>
                <select
                    value={selection.sort}
                    aria-label={m.watchlist_sorting()}
                    class="h-10 max-w-40 appearance-none bg-transparent px-2 text-xs font-bold text-muted uppercase outline-none hover:text-foreground"
                    onchange={(event) => onselect({ sort: event.currentTarget.value as Selection['sort'] })}
                >
                    <option value="updated">{m.watchlist_updated()}</option>
                    <option value="added">{m.watchlist_added()}</option>
                    <option value="alphabetical">{m.watchlist_alphabetical()}</option>
                </select>
            </label>
            <label>
                <span class="sr-only">{m.watchlist_sort_order()}</span>
                <select
                    value={selection.order}
                    aria-label={m.watchlist_sort_order()}
                    class="h-10 max-w-32 appearance-none bg-transparent px-2 text-xs font-bold text-muted uppercase outline-none hover:text-foreground"
                    onchange={(event) => onselect({ order: event.currentTarget.value as Selection['order'] })}
                >
                    <option value="newest">{m.watchlist_newest()}</option>
                    <option value="oldest">{m.watchlist_oldest()}</option>
                </select>
            </label>
        </div>
    {/if}
</div>
