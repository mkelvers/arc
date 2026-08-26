<script lang="ts">
    import { XIcon } from 'phosphor-svelte';
    import { fly } from 'svelte/transition';
    import { prefersReducedMotion } from 'svelte/motion';
    import { cn } from '$lib/utils';
    import { m } from '$lib/paraglide/messages.js';

    interface Props {
        message: string;
        tone?: 'error' | 'success';
        ondismiss: () => void;
    }

    let { message, tone = 'success', ondismiss }: Props = $props();

    $effect(() => {
        if (!message || tone === 'error') {
            return;
        }
        const timeout = setTimeout(ondismiss, 4_000);
        return () => clearTimeout(timeout);
    });
</script>

{#if message}
    <div
        class={cn(
            'fixed inset-x-0 top-0 z-100 grid min-h-12 place-items-center px-14 py-2 text-sm font-semibold text-on-status',
            tone === 'error' ? 'bg-status-error' : 'bg-status-success'
        )}
        out:fly={{
            y: prefersReducedMotion.current ? 0 : -48,
            duration: prefersReducedMotion.current ? 120 : 180,
        }}
        role={tone === 'error' ? 'alert' : 'status'}
        aria-live={tone === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
    >
        <p class="text-center">{message}</p>
        <button
            class="absolute inset-y-0 right-0 grid w-12 place-items-center transition-[background-color,transform] duration-150 hover:bg-black/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-status active:scale-90"
            type="button"
            aria-label={m.shared_dismiss()}
            onclick={ondismiss}
        >
            <XIcon size={20} weight="bold" aria-hidden="true" />
        </button>
    </div>
{/if}
