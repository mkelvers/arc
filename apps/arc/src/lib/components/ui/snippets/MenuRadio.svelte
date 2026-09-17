<script lang="ts">
    import Radio from '$lib/components/ui/input/Radio.svelte';

    interface Props {
        selected: boolean;
        label: string;
        onclick: () => void;
    }

    let { selected, label, onclick }: Props = $props();
</script>

<button
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    class:text-foreground={selected}
    class="flex min-h-11 w-full appearance-none items-center gap-2.5 border-0 bg-transparent px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
    onclick={onclick}
>
    <Radio checked={selected} aria-hidden="true" tabindex={-1} class="pointer-events-none" />
    {label}
</button>
