<script lang="ts">
    import LoadingSpinner from './LoadingSpinner.svelte';

    interface Props {
        label: string;
    }

    let { label }: Props = $props();
</script>

<main
    class="grid min-h-[calc(100dvh-3.5rem)] place-items-center bg-canvas text-foreground"
    aria-busy="true"
    aria-live="polite"
>
    <span class="sr-only">{label}</span>
    <LoadingSpinner size="2.25rem" />
</main>
