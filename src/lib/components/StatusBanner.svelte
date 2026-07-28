<script lang="ts">
	import { XIcon } from 'phosphor-svelte';

	type Tone = 'error' | 'success';

	let {
		message,
		tone,
		ondismiss
	}: {
		message: string;
		tone: Tone;
		ondismiss: () => void;
	} = $props();
</script>

{#if message}
	<div
		class:bg-status-error={tone === 'error'}
		class:bg-status-success={tone === 'success'}
		class="fixed inset-x-0 top-0 z-100 grid min-h-12 place-items-center px-14 py-2 text-sm font-semibold text-on-status"
		role={tone === 'error' ? 'alert' : 'status'}
		aria-live={tone === 'error' ? 'assertive' : 'polite'}
	>
		<p class="text-center">{message}</p>
		<button
			class="absolute inset-y-0 right-0 grid w-12 place-items-center transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-status"
			type="button"
			aria-label="Dismiss message"
			onclick={ondismiss}
		>
			<XIcon size={20} weight="bold" aria-hidden="true" />
		</button>
	</div>
{/if}
