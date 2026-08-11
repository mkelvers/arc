<script lang="ts">
    import { SpinnerGapIcon } from 'phosphor-svelte';

    let {
        label,
        overlay = false,
    }: {
        label: string;
        overlay?: boolean;
    } = $props();
</script>

{#if overlay}
    <div
        class="fixed inset-0 z-100 grid place-items-center bg-black/75 px-6 text-center backdrop-blur-[2px]"
        role="status"
        aria-live="polite"
    >
        <span class="flex flex-col items-center gap-4 text-sm font-medium text-foreground">
            <SpinnerGapIcon
                size="2.25rem"
                weight="bold"
                class="animate-spin text-accent"
                aria-hidden="true"
            />
            {label}
        </span>
    </div>
{:else}
    <span class="inline-flex items-center gap-2" role="status" aria-live="polite">
        <SpinnerGapIcon size="1.1rem" weight="bold" class="animate-spin" aria-hidden="true" />
        {label}
    </span>
{/if}
