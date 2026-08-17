<script lang="ts">
    import { accountAvatar } from '$lib/account-avatar';
    import { cn } from '$lib/utils';

    interface Props {
        username: string;
        class?: string;
    }

    let { username, class: className }: Props = $props();
    const avatar = $derived(accountAvatar(username));
</script>

<span
    aria-hidden="true"
    class={cn(
        'inline-grid shrink-0 select-none place-items-center rounded-full font-medium text-white uppercase',
        className
    )}
    style:background-color={avatar.color}
>
    {avatar.initial}
</span>
