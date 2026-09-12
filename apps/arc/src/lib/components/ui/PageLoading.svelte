<script lang="ts">
    import Spinner from './Spinner.svelte';

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
    <Spinner size="2.25rem"></Spinner>
</main>
