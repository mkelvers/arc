<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { MagnifyingGlassIcon } from 'phosphor-svelte';
	import logo from '$lib/assets/logo.png';
	import favicon from '$lib/assets/favicon.ico';

	let { children } = $props();

	const authRoute = $derived(
		page.route.id?.startsWith('/(auth)/') ?? false
	);
</script>

<svelte:head>
	<title>Arc</title>
	<link rel="icon" href={favicon} type="image/png" sizes="512x512" />
	<link rel="apple-touch-icon" href={favicon} />
</svelte:head>

{#if page.status >= 400 || authRoute}
	{@render children()}
{:else}
	<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header/95 backdrop-blur">
		<nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label="Primary navigation">
			<div class="flex h-full items-center gap-3">
				<a
					href="/"
					class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
					aria-label="Home"
					title="Home"
				>
					<img src={logo} alt="" width="1024" height="420" class="h-10 w-auto shrink-0" aria-hidden="true" />
				</a>
			</div>

			<div class="flex h-full items-center">
				<a
					href="/search"
					class="inline-flex h-full w-14 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muted"
					aria-label="Search"
					title="Search"
				>
					<MagnifyingGlassIcon size={24} weight="regular" aria-hidden="true" />
				</a>
			</div>
		</nav>
	</header>

	<main class="pt-14">
		{@render children()}
	</main>
{/if}
