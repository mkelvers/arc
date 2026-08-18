<script lang="ts">
    import { page } from '$app/state';
    import Logo from '$lib/components/ui/Logo.svelte';

    const error = $derived(page.status !== 404);
    const heading = $derived(error ? 'Something went wrong.' : 'Page not found.');
    const description = $derived(
        error
            ? 'Arc could not load this page. Please head back home and try again.'
            : 'This page does not exist. Please head back home and try again.'
    );
</script>

<svelte:head>
    <title>Arc — {heading}</title>
    <meta name="description" content={description} />
    <meta name="robots" content="noindex" />
</svelte:head>

<main
    class="relative isolate flex min-h-dvh flex-col overflow-hidden bg-canvas px-6 text-foreground"
    aria-labelledby="error-title"
>
    <header class="flex h-20 items-center sm:h-24">
        <a
            href="/"
            aria-label="Arc home"
            class="focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent"
        >
            <Logo alt="Arc" class="h-9" />
        </a>
    </header>

    <section class="flex flex-1 flex-col items-center justify-center pb-24 text-center sm:pb-32">
        <h1 id="error-title" class="text-4xl leading-tight font-normal tracking-tight sm:text-6xl">
            {heading}
        </h1>
        <p class="mt-5 max-w-md text-base leading-7 text-muted sm:text-lg">{description}</p>

        <div class="mt-9 flex justify-center">
            <a
                href="/"
                class="inline-flex min-h-11 items-center bg-foreground px-5 text-xs font-bold text-canvas uppercase transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Back to homepage
            </a>
        </div>
    </section>
</main>
