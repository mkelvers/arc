<script lang="ts">
    import { CircleIcon, RadioButtonIcon } from 'phosphor-svelte';

    interface Props {
        href: string;
        label: string;
        selected: boolean;
    }

    let { href, label, selected }: Props = $props();
</script>

<a
    role="menuitemradio"
    aria-checked={selected}
    href={href}
    class:text-foreground={selected}
    class="flex min-h-11 items-center gap-2.5 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
>
    {#if selected}
        <RadioButtonIcon size="1.25rem" weight="fill" class="text-input-accent" aria-hidden="true" />
    {:else}
        <CircleIcon size="1.25rem" weight="regular" aria-hidden="true" />
    {/if}
    {label}
</a>
