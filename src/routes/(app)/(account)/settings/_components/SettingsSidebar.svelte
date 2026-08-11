<script lang="ts">
    import { page } from '$app/state';

    const sections = [
        {
            title: 'General',
            links: [
                { label: 'Preferences', href: '/settings/preferences' },
                { label: 'Appearance', href: '/settings/appearance' },
                { label: 'Notifications', href: '/settings/notifications' },
            ],
        },
        {
            title: 'Playback',
            links: [
                { label: 'Playback Preferences', href: '/settings/playback-preferences' },
                { label: 'Subtitles', href: '/settings/subtitles' },
            ],
        },
        {
            title: 'Library',
            links: [
                { label: 'Watchlist', href: '/settings/watchlist' },
                { label: 'Content Preferences', href: '/settings/content-preferences' },
            ],
        },
        {
            title: 'Connections',
            links: [
                { label: 'Anime Accounts', href: '/settings/accounts' },
                { label: 'Sync Settings', href: '/settings/sync' },
                { label: 'Import & Export', href: '/settings/import-export' },
            ],
        },
        {
            title: 'Account',
            links: [
                { label: 'Profile', href: '/settings/profile' },
                { label: 'Email', href: '/settings/email' },
                { label: 'Password', href: '/settings/password' },
                { label: 'Devices & Sessions', href: '/settings/devices-sessions' },
            ],
        },
        {
            title: 'Privacy & Data',
            links: [
                { label: 'Privacy', href: '/settings/privacy' },
                { label: 'Data Management', href: '/settings/data-management' },
            ],
        },
    ];
</script>

<aside class="w-full max-w-64" aria-label="Account settings">
    <a
        href="/settings"
        class="text-2xl font-bold tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >Account Settings</a
    >

    <nav class="mt-12" aria-label="Settings sections">
        {#each sections as section}
            <section class="not-first:mt-8">
                <h2 class="px-1 text-xl font-bold tracking-tight">{section.title}</h2>

                <ul class="mt-3 space-y-1">
                    {#each section.links as link}
                        <li>
                            <a
                                href={link.href}
                                class="mx-1 block px-2 py-2.5 text-base {page.url.pathname ===
                                link.href
                                    ? 'text-accent hover:text-accent focus-visible:text-accent'
                                    : 'text-muted hover:text-foreground focus-visible:text-foreground'} transition-colors hover:bg-panel-hover focus-visible:bg-panel-hover focus-visible:outline-none"
                                >{link.label}</a
                            >
                        </li>
                    {/each}
                </ul>
            </section>
        {/each}
    </nav>
</aside>
