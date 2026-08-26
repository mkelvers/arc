<script lang="ts">
    import { page } from '$app/state';
    import type { LayoutProps } from './$types';
    import { m } from '$lib/paraglide/messages.js';

    let { children }: LayoutProps = $props();

    const pages = {
        '/settings/subtitles': {
            title: m.settings_subtitles(),
            synopsis: m.settings_subtitles_synopsis(),
        },
        '/settings/import-export': {
            title: m.settings_import_export(),
            synopsis: m.settings_import_export_synopsis(),
        },
    } as const;
    const sections = [
        { title: m.settings_playback(), links: [{ label: m.settings_subtitles(), href: '/settings/subtitles' }] },
        {
            title: m.settings_watchlist(),
            links: [{ label: m.settings_import_export(), href: '/settings/import-export' }],
        },
    ] as const;
    const currentPage = $derived(
        pages[page.url.pathname as keyof typeof pages] ?? {
            title: m.settings_account(),
            synopsis: m.settings_account_synopsis(),
        }
    );
</script>

<main
    class="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl gap-8 px-5 py-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-12 md:px-8 md:py-12"
>
    <aside class="w-full max-w-64" aria-label={m.settings_account_aria()}>
        <a
            href="/settings"
            class="text-2xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
            {m.settings_account()}
        </a>

        <nav class="mt-12" aria-label={m.settings_sections()}>
            {#each sections as section}
                <section class="not-first:mt-8">
                    <h2 class="px-1 text-xl font-bold tracking-tight">{section.title}</h2>
                    <ul class="mt-3 space-y-1">
                        {#each section.links as link}
                            <li>
                                <a
                                    href={link.href}
                                    aria-current={page.url.pathname === link.href ? 'page' : undefined}
                                    class="mx-1 block px-2 py-2.5 text-base {page.url.pathname === link.href
                                        ? 'text-accent hover:text-accent focus-visible:text-accent'
                                        : 'text-muted hover:text-foreground focus-visible:text-foreground'} transition-colors hover:bg-panel-hover focus-visible:bg-panel-hover focus-visible:outline-none"
                                >
                                    {link.label}
                                </a>
                            </li>
                        {/each}
                    </ul>
                </section>
            {/each}
        </nav>
    </aside>

    <section
        class="h-fit min-w-0 self-start bg-panel px-7 py-8 md:px-10 md:py-10"
        aria-labelledby="settings-title"
    >
        <header class="text-center">
            <h1 id="settings-title" class="text-2xl font-bold tracking-tight">{currentPage.title}</h1>
            <p class="mt-2 text-base text-muted">{currentPage.synopsis}</p>
        </header>
        <div class="mt-8">{@render children()}</div>
    </section>
</main>
