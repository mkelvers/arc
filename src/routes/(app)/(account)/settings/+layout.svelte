<script lang="ts">
    import { page } from '$app/state';
    import SettingsLayer from './_components/SettingsLayer.svelte';
    import SettingsSidebar from './_components/SettingsSidebar.svelte';

    let { children } = $props();

    const pages = {
        '/settings/subtitles': {
            title: 'Subtitles',
            synopsis: 'Manage subtitle display preferences.',
        },
        '/settings/accounts': {
            title: 'Anime Accounts',
            synopsis: 'Publish your Arc library to AniList.',
        },
        '/settings/import-export': {
            title: 'Import & Export',
            synopsis: 'Move your anime data into or out of Arc.',
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
