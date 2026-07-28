<script lang="ts">
	import logo from '$lib/assets/logo-128.png';

	let { children } = $props();
</script>

<div class="flex min-h-dvh flex-col bg-canvas text-foreground">
	<header class="h-14 shrink-0 bg-header">
		<div class="grid h-full place-items-center">
			<img
				src={logo}
				alt="Arc"
				width="166"
				height="128"
				class="h-8 w-auto"
			/>
		</div>
	</header>

	<main class="flex flex-1 justify-center px-5 pt-20 sm:px-10 sm:pt-40">
		{@render children()}
	</main>
</div>
