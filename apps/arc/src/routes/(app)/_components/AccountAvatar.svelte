<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        username: string;
        image?: string | null;
        class?: string;
    }

    let { username, image = null, class: className }: Props = $props();
    const diceBearImage = $derived(
        `https://api.dicebear.com/10.x/thumbs/svg?seed=${encodeURIComponent(username)}`
    );
</script>

<span
    class={cn(
        'inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full bg-accent font-medium text-on-accent uppercase',
        className
    )}
>
    <img src={image ?? diceBearImage} alt="" class="size-full object-cover" aria-hidden="true" />
</span>
