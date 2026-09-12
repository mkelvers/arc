<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        selected: boolean;
    }

    let { selected }: Props = $props();
</script>

<span
    aria-hidden="true"
    class={cn(
        'grid size-4 place-items-center rounded-full border',
        selected ? 'border-input-accent' : 'border-white/55'
    )}
>
    {#if selected}
        <span class="size-1.5 rounded-full bg-input-accent"></span>
    {/if}
</span>
