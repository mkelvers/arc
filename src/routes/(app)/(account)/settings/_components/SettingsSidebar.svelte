<script lang="ts">
    import { page } from '$app/state';

    const sections = [
        {
            title: 'Playback',
            links: [{ label: 'Subtitles', href: '/settings/subtitles' }],
        },
        {
            title: 'Connections',
            links: [
                { label: 'Anime Accounts', href: '/settings/accounts' },
                { label: 'Import & Export', href: '/settings/import-export' },
            ],
        },
    ];
</script>

<aside class="w-full max-w-64" aria-label="Account settings">
    <a
        href="/settings"
        class="text-2xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
        Account Settings
    </a>

    <nav class="mt-12" aria-label="Settings sections">
        {#each sections as section}
            <section class="not-first:mt-8">
                <h2 class="px-1 text-xl font-bold tracking-tight">{section.title}</h2>

                <ul class="mt-3 space-y-1">
                    {#each section.links as link}
                        <li>
                            <a
                                href={link.href}
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
