<script lang="ts">
    import { onMount } from 'svelte';
    import * as preferences from '$lib/player/preferences';

    let iframes = $state(false);

    onMount(() => {
        iframes = preferences.load({}, []).iframes ?? false;
    });

    function saveIframes(enabled: boolean) {
        iframes = enabled;
        preferences.save('iframes', enabled);
    }
</script>

<div class="space-y-8">
    <section aria-labelledby="source-settings-title">
        <h2 id="source-settings-title" class="text-lg font-medium">Sources</h2>
        <label class="mt-4 flex cursor-pointer items-start gap-3 text-sm text-muted">
            <span class="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
                <input
                    bind:checked={iframes}
                    type="checkbox"
                    class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
                    aria-label="Allow embedded players"
                    onchange={(event) => saveIframes(event.currentTarget.checked)}
                />
                <span
                    class="flex size-4 items-center justify-center border border-border-strong bg-transparent text-player-accent transition-colors peer-hover:border-player-accent peer-checked:border-player-accent peer-focus-visible:ring-2 peer-focus-visible:ring-player-accent peer-checked:[&>svg]:opacity-100"
                    aria-hidden="true"
                >
                    <svg viewBox="0 0 12 12" class="size-2.5 opacity-0 transition-opacity" fill="none">
                        <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                </span>
            </span>
            <span>
                <span class="block font-medium">Allow embedded players</span>
                <span class="mt-1 block text-muted">
                    Use provider iframe players when direct video sources are unavailable. Embedded players may
                    have separate controls, ads, or redirects.
                </span>
            </span>
        </label>
    </section>
</div>
