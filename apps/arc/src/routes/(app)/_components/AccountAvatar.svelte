<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        username: string;
        image?: string | null;
        hasUnreadNotifications?: boolean;
        class?: string;
    }

    let { username, image = null, hasUnreadNotifications = false, class: className }: Props = $props();
    const diceBearImage = $derived(
        `https://api.dicebear.com/10.x/thumbs/svg?seed=${encodeURIComponent(username)}`
    );
</script>

<span
    class={cn(
        'inline-grid shrink-0 select-none place-items-center rounded-full bg-accent font-medium text-on-accent uppercase',
        hasUnreadNotifications &&
            "relative after:pointer-events-none after:absolute after:-top-0.5 after:-right-0.5 after:size-2 after:rounded-full after:bg-status-error after:ring-2 after:ring-header after:content-['']",
        className
    )}
>
    <img src={image ?? diceBearImage} alt="" class="size-full rounded-full object-cover" aria-hidden="true" />
</span>
