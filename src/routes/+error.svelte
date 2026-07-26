<script lang="ts">
    import { page } from '$app/state';
    import logo from '$lib/assets/logo-128.png';

    const title = $derived(
        page.status === 404
            ? 'Page not found'
            : page.status >= 500
              ? 'Something went wrong'
              : 'Unable to load this page',
    );
    const message = $derived(
        page.error?.message === 'Not Found'
            ? 'The page you were looking for no longer exists.'
            : page.error?.message ?? 'Arc could not load this page.',
    );
</script>

<svelte:head>
    <title>{page.status} - {title} - Arc</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center bg-[#08090a] px-6 py-14 text-white">
    <section class="grid w-full max-w-4xl items-center gap-12 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-16 lg:gap-24">
        <img
            src={logo}
            alt="Arc"
            width="166"
            height="128"
            class="mx-auto w-40 sm:w-56"
        />

        <div class="mx-auto max-w-lg text-center sm:mx-0 sm:text-left">
            <p class="text-sm font-semibold text-[#8b9098]">
                Error {page.status}
            </p>
            <h1 class="mt-3 text-4xl leading-tight font-bold tracking-[-0.035em] sm:text-5xl">
                {title}
            </h1>
            <p class="mt-5 text-base leading-7 text-[#a8acb3]">
                {message}
            </p>

            <nav class="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:justify-start" aria-label="Error recovery">
                <a
                    href="/"
                    class="inline-flex min-h-12 items-center bg-white px-6 text-sm font-semibold text-black transition-colors hover:bg-[#dedfe1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                    Go to Arc
                </a>
                <a
                    href="/search"
                    class="inline-flex min-h-12 items-center text-sm font-semibold text-[#c4c7cc] underline decoration-[#555a62] underline-offset-4 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                    Search anime
                </a>
            </nav>
        </div>
    </section>
</main>
