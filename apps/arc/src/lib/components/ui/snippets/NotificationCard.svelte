<script lang="ts">
    import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
    import { DotsThreeVerticalIcon, PlayIcon } from 'phosphor-svelte';
    import type { Notification } from '@arc/core/client';
    import Dropdown from '$lib/components/ui/dropdown/Dropdown.svelte';
    import Button from '$lib/components/ui/button/Button.svelte';
    import { cn } from '$lib/utils';

    interface Props {
        entry: Notification;
        onMarkAsRead: (entry: Notification) => void | Promise<void>;
        onOpen: (entry: Notification) => void | Promise<void>;
    }

    let { entry, onMarkAsRead, onOpen }: Props = $props();

    function formatEpisodeNumbers(numbers: readonly number[]) {
        const ranges: string[] = [];
        let start = numbers[0]!;
        let end = start;

        for (const number of numbers.slice(1)) {
            if (number === end + 1) {
                end = number;
                continue;
            }
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = number;
            end = number;
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        return ranges.join(', ');
    }
</script>

<div
    class="group relative grid w-full gap-5 text-left transition-colors hover:bg-surface focus-within:bg-surface sm:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] sm:gap-8"
>
    <Button
        type="button"
        class="grid h-auto w-full gap-5 text-left whitespace-normal sm:col-span-2 sm:grid-cols-subgrid sm:gap-8"
        onclick={() => onOpen(entry)}
    >
        <div
            class={cn(
                'relative aspect-4/3 overflow-hidden bg-panel',
                !entry.readAt &&
                    "after:absolute after:top-2 after:right-2 after:size-2 after:rounded-full after:bg-status-error after:content-['']"
            )}
        >
            {#if entry.imageUrl}
                <img src={entry.imageUrl} alt="" class="size-full object-cover" />
            {:else}
                <div class="grid size-full place-items-center text-muted">
                    <PlayIcon size={24} aria-hidden="true"></PlayIcon>
                </div>
            {/if}
        </div>
        <div class="min-w-0 self-start py-5">
            <p class="text-base font-semibold text-foreground sm:text-lg">{entry.title}</p>
            <p class="mt-2 text-sm leading-6 text-muted sm:text-base">
                {entry.type === 'dub_available'
                    ? entry.dubEpisodeNumbers.length === 1
                        ? `The dubbed version of episode ${formatEpisodeNumbers(entry.episodeNumbers)} is now available to watch.`
                        : `The dubbed versions of episodes ${formatEpisodeNumbers(entry.episodeNumbers)} are now available to watch.`
                    : entry.dubEpisodeNumbers.length
                      ? entry.episodeNumbers.length === 1 && entry.dubEpisodeNumbers.length === 1
                          ? `Episode ${formatEpisodeNumbers(entry.episodeNumbers)} has just aired and is now available to watch, and its dubbed version is available too.`
                          : `Episodes ${formatEpisodeNumbers(entry.episodeNumbers)} are now available to watch, including dubbed versions of episodes ${formatEpisodeNumbers(entry.dubEpisodeNumbers)}.`
                      : entry.episodeNumbers.length === 1
                        ? `Episode ${formatEpisodeNumbers(entry.episodeNumbers)} aired and is now available to watch.`
                        : `Episodes ${formatEpisodeNumbers(entry.episodeNumbers)} are now available to watch.`}
            </p>
            <span
                class="mt-4 inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase"
            >
                Watch now
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true"></CaretRightIcon>
            </span>
        </div>
    </Button>
    {#if !entry.readAt}
        <div
            class="absolute right-3 bottom-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        >
            <Dropdown id={`notification-${entry.id}-options`} className="w-48 *:p-0">
                {#snippet trigger()}
                    <span class="sr-only">Notification options</span>
                    <DotsThreeVerticalIcon size="1.25rem" weight="bold" aria-hidden="true"></DotsThreeVerticalIcon>
                {/snippet}
                {#snippet children()}
                    <div role="menu" aria-label="Notification options">
                        <Button
                            type="button"
                            role="menuitem"
                            class="block w-full px-5 py-3 text-left text-sm leading-tight font-normal text-muted whitespace-nowrap hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            onclick={() => onMarkAsRead(entry)}
                        >
                            Mark as read
                        </Button>
                    </div>
                {/snippet}
            </Dropdown>
        </div>
    {/if}
</div>
