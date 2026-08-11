<script lang="ts">
    import { page } from '$app/state';
    import SettingsLayer from './_components/SettingsLayer.svelte';
    import SettingsSidebar from './_components/SettingsSidebar.svelte';

    let { children } = $props();

    const pages = {
        '/settings/preferences': {
            title: 'Preferences',
            synopsis: 'Manage your general Arc preferences.',
        },
        '/settings/appearance': {
            title: 'Appearance',
            synopsis: 'Customize how Arc looks.',
        },
        '/settings/notifications': {
            title: 'Notifications',
            synopsis: 'Choose which notifications you receive from Arc.',
        },
        '/settings/playback-preferences': {
            title: 'Playback Preferences',
            synopsis: 'Configure your playback experience.',
        },
        '/settings/subtitles': {
            title: 'Subtitles',
            synopsis: 'Manage subtitle display preferences.',
        },
        '/settings/watchlist': {
            title: 'Watchlist',
            synopsis: 'Manage your watchlist preferences.',
        },
        '/settings/content-preferences': {
            title: 'Content Preferences',
            synopsis: 'Choose how content is organized and displayed.',
        },
        '/settings/accounts': {
            title: 'Anime Accounts',
            synopsis: 'Connect your anime accounts to Arc.',
        },
        '/settings/sync': {
            title: 'Sync Settings',
            synopsis: 'Choose how your anime accounts stay in sync.',
        },
        '/settings/import-export': {
            title: 'Import & Export',
            synopsis: 'Move your anime data into or out of Arc.',
        },
        '/settings/profile': {
            title: 'Profile',
            synopsis: 'Manage your Arc profile.',
        },
        '/settings/email': {
            title: 'Email',
            synopsis: 'Manage the email address on your account.',
        },
        '/settings/password': {
            title: 'Password',
            synopsis: 'Update your account password.',
        },
        '/settings/devices-sessions': {
            title: 'Devices & Sessions',
            synopsis: 'Review the devices and sessions connected to your account.',
        },
        '/settings/privacy': {
            title: 'Privacy',
            synopsis: 'Manage your privacy settings.',
        },
        '/settings/data-management': {
            title: 'Data Management',
            synopsis: 'Manage the data associated with your Arc account.',
        },
    } as const;

    const currentPage = $derived(
        pages[page.url.pathname as keyof typeof pages] ?? {
            title: 'Account Settings',
            synopsis: 'Manage your Arc account settings.',
        }
    );
</script>

<svelte:head>
    <title>Arc — {currentPage.title}</title>
</svelte:head>

<main
    class="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl gap-8 px-5 py-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-12 md:px-8 md:py-12"
>
    <SettingsSidebar />

    <SettingsLayer title={currentPage.title} synopsis={currentPage.synopsis}>
        {@render children()}
    </SettingsLayer>
</main>
