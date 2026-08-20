<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        username: string;
        class?: string;
    }

    let { username, class: className }: Props = $props();
</script>

<span
    aria-hidden="true"
    class={cn(
        'inline-grid shrink-0 select-none place-items-center rounded-full bg-accent font-medium text-on-accent uppercase',
        className
    )}
>
    {username.trim()[0]?.toUpperCase() ?? '?'}
</span>
