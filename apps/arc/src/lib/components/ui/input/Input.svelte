<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    type Props = HTMLInputAttributes & {
        ref?: HTMLInputElement | null;
    };

    let { value = $bindable(), ref = $bindable(null), ...props }: Props = $props();
</script>

<input bind:this={ref} bind:value={value} {...props} />
