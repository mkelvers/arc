<script lang="ts">
    import { cn } from '$lib/utils';

    let { class: className }: { class?: string } = $props();
</script>

<span class={cn('block animate-pulse bg-surface', className)} aria-hidden="true"></span>
