<script lang="ts">
	import { MagnifyingGlassIcon } from 'phosphor-svelte';
	import logo from '$lib/assets/logo.png';

	let { children } = $props();
</script>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header/95 backdrop-blur">
	<nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label="Primary navigation">
		<div class="flex h-full items-center gap-2">
			<a
				href="/"
				class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
				aria-label="Home"
				title="Home"
			>
				<img src={logo} alt="" width="1024" height="420" class="h-10 w-auto shrink-0" aria-hidden="true" />
			</a>

			<a
				href="/simulcast"
				class="inline-flex h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
			>
				Simulcast
			</a>
		</div>

		<a
			href="/search"
			class="inline-flex h-full w-14 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
			aria-label="Search"
			title="Search"
		>
			<MagnifyingGlassIcon size={24} weight="regular" aria-hidden="true" />
		</a>
	</nav>
</header>

<div class="pt-14">
	{@render children()}
</div>
