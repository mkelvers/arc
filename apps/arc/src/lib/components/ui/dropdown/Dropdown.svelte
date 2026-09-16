<script lang="ts">
	import type { Snippet } from "svelte";
	import Button from "../button/Button.svelte";
	import { cn } from "..";

	type Props = {
		children: Snippet;
		trigger: Snippet;
		id: string;
		alignment?: "left" | "right";
		className?: string;
	};

	let {
		alignment = "right",
		children,
		className,
		id,
		trigger,
	}: Props = $props();
</script>

<div class="dropdown-root group relative">
	<Button
		class="dropdown-trigger cursor-pointer p-2 uppercase tracking-wide hover:bg-dropdown hover:text-white group-has-[.dropdown-menu:popover-open]:bg-dropdown group-has-[.dropdown-menu:popover-open]:text-white text-[#8c8c8c]"
		variant="ghost"
		popovertarget={id}
	>
		{@render trigger()}
	</Button>

	<div
		{id}
		popover
		data-alignment={alignment}
		class={cn(
			"dropdown-menu open:flex z-10 w-56 flex-col gap-1 overflow-hidden bg-dropdown shadow-lg *:px-5 *:py-3 *:text-[#8c8c8c] [&>button]:w-full [&>button]:cursor-pointer [&>button]:justify-start [&>button:hover]:bg-dropdown-hover text-[0.875rem]",
			className,
		)}
	>
		{@render children()}
	</div>
</div>

<style>
	:global(.dropdown-trigger) {
		anchor-name: --dropdown-trigger;
	}

	.dropdown-menu {
		position-anchor: --dropdown-trigger;
		inset: auto;
		top: anchor(bottom);
	}

	.dropdown-menu[data-alignment="left"] {
		left: anchor(left);
	}

	.dropdown-menu[data-alignment="right"] {
		right: anchor(right);
	}
</style>
