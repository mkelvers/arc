<script lang="ts">
    import { page } from '$app/state';
    import SettingsSidebar from './_components/SettingsSidebar.svelte';
    import type { LayoutProps } from './$types';

    let { children }: LayoutProps = $props();

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

    <section
        class="h-fit min-w-0 self-start bg-panel px-7 py-8 md:px-10 md:py-10"
        aria-labelledby="settings-title"
    >
        <header class="text-center">
            <h1 id="settings-title" class="text-2xl font-bold tracking-tight">{currentPage.title}</h1>
            <p class="mt-2 text-base text-muted">{currentPage.synopsis}</p>
        </header>

        <div class="mt-8">
            {@render children()}
        </div>
    </section>
</main>
