<script lang="ts">
    import { page } from '$app/state';
    import { CaretDownIcon, XIcon } from 'phosphor-svelte';
    import type { LayoutProps } from './$types';
    import { locale } from '$lib/locale.svelte';
    import { m } from '$lib/paraglide/messages.js';

    let { children }: LayoutProps = $props();
    let mobileMenuOpen = $state(false);

    const pages = {
        '/settings/subtitles': {
            title: m.settings_subtitles,
            synopsis: m.settings_subtitles_synopsis,
        },
        '/settings/import-export': {
            title: m.settings_import_export,
            synopsis: m.settings_import_export_synopsis,
        },
        '/settings/preferences': {
            title: m.settings_preferences,
            synopsis: m.settings_preferences_synopsis,
        },
    } as const;
    const sections = [
        { title: m.settings_playback, links: [{ label: m.settings_subtitles, href: '/settings/subtitles' }] },
        {
            title: m.settings_watchlist,
            links: [{ label: m.settings_import_export, href: '/settings/import-export' }],
        },
        {
            title: m.settings_preferences,
            links: [{ label: m.settings_language, href: '/settings/preferences' }],
        },
    ] as const;
    const currentPage = $derived(
        pages[page.url.pathname as keyof typeof pages] ?? {
            title: m.settings_account,
            synopsis: m.settings_account_synopsis,
        }
    );

    function localized(message: () => string) {
        if (!locale.current) {
            return '';
        }
        return message();
    }

    $effect(() => {
        if (!mobileMenuOpen) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    });

    function closeMobileMenu() {
        mobileMenuOpen = false;
    }
</script>

<main
    class="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl gap-6 px-4 py-6 sm:gap-8 sm:px-5 sm:py-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-12 md:px-8 md:py-12"
>
    <aside class="hidden w-full md:block md:max-w-64" aria-label={localized(m.settings_account_aria)}>
        <a
            href="/settings"
            class="text-2xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
            {localized(m.settings_account)}
        </a>

        <nav class="mt-8 md:mt-12" aria-label={localized(m.settings_sections)}>
            {#each sections as section}
                <section class="not-first:mt-6 md:not-first:mt-8">
                    <h2 class="px-1 text-lg font-bold tracking-tight sm:text-xl">{localized(section.title)}</h2>
                    <ul class="mt-3 grid grid-cols-2 gap-1 md:block md:space-y-1">
                        {#each section.links as link}
                            <li>
                                <a
                                    href={link.href}
                                    aria-current={page.url.pathname === link.href ? 'page' : undefined}
                                    class="mx-1 block px-2 py-2.5 text-base {page.url.pathname === link.href
                                        ? 'text-accent hover:text-accent focus-visible:text-accent'
                                        : 'text-muted hover:text-foreground focus-visible:text-foreground'} transition-colors hover:bg-panel-hover focus-visible:bg-panel-hover focus-visible:outline-none"
                                >
                                    {localized(link.label)}
                                </a>
                            </li>
                        {/each}
                    </ul>
                </section>
            {/each}
        </nav>
    </aside>

    <div class="md:hidden">
        <h1 class="text-2xl font-bold tracking-tight">{localized(m.settings_account)}</h1>
        <button
            type="button"
            class="mt-8 flex items-center gap-3 text-xs font-bold tracking-wide text-muted uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-settings-menu"
            onclick={() => (mobileMenuOpen = true)}
        >
            <CaretDownIcon size={14} aria-hidden="true" />
            <span>{localized(m.settings_sections)}</span>
        </button>
    </div>

    {#if mobileMenuOpen}
        <button
            type="button"
            class="fixed inset-0 z-50 bg-black/70"
            aria-label={localized(m.shared_close_menu)}
            onclick={closeMobileMenu}
        ></button>
        <div
            id="mobile-settings-menu"
            class="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#272727] shadow-2xl md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={localized(m.settings_sections)}
        >
            <header class="flex min-h-14 shrink-0 items-center justify-between bg-[#151515] px-5">
                <h2 class="text-base font-medium">{localized(m.settings_account)}</h2>
                <button
                    type="button"
                    class="grid size-9 place-items-center text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={localized(m.shared_close_menu)}
                    onclick={closeMobileMenu}
                >
                    <XIcon size={24} aria-hidden="true" />
                </button>
            </header>
            <nav class="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-label={localized(m.settings_sections)}>
                {#each sections as section}
                    <section class="not-first:mt-8">
                        <h3 class="text-lg font-bold tracking-tight">{localized(section.title)}</h3>
                        <ul class="mt-3 space-y-1">
                            {#each section.links as link}
                                <li>
                                    <a
                                        href={link.href}
                                        aria-current={page.url.pathname === link.href ? 'page' : undefined}
                                        onclick={closeMobileMenu}
                                        class="block py-2.5 text-base {page.url.pathname === link.href
                                            ? 'text-foreground'
                                            : 'text-muted'} transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                                    >
                                        {localized(link.label)}
                                    </a>
                                </li>
                            {/each}
                        </ul>
                    </section>
                {/each}
            </nav>
        </div>
    {/if}

    <section
        class="h-fit min-w-0 self-start bg-panel px-4 py-6 sm:px-7 sm:py-8 md:px-10 md:py-10"
        aria-labelledby="settings-title"
    >
        <header class="text-left md:text-center">
            <h1 id="settings-title" class="text-2xl font-bold tracking-tight">{localized(currentPage.title)}</h1>
            <p class="mt-2 hidden text-base text-muted md:block">{localized(currentPage.synopsis)}</p>
        </header>
        <div class="mt-8">{@render children()}</div>
    </section>
</main>
