<script lang="ts">
    import { goto } from '$app/navigation';
    import { navigating } from '$app/state';
    import {
        BookmarkSimpleIcon,
        CaretDownIcon,
        GearIcon,
        MagnifyingGlassIcon,
        ListIcon,
        SignOutIcon,
        UserCircleIcon,
    } from 'phosphor-svelte';
    import { authClient } from '$lib/auth-client';
    import { m } from '$lib/i18n.svelte';
    import Logo from '$lib/components/ui/Logo.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import AccountAvatar from './_components/AccountAvatar.svelte';
    import PageLoading from '$lib/components/ui/PageLoading.svelte';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();
    let navigationLoading = $state(false);
    let mobileCategoriesOpen = $state(false);

    $effect(() => {
        if (!navigating.to) {
            navigationLoading = false;
            return;
        }

        const timeout = setTimeout(() => (navigationLoading = true), 120);
        return () => clearTimeout(timeout);
    });

    async function signOut() {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => goto('/login'),
            },
        });
    }
</script>

<svelte:head>
    <link rel="canonical" href={data.canonical} />
</svelte:head>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
    <nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label={m.nav_primary()}>
        <div class="flex h-full items-center max-sm:pl-12">
            <div class="flex h-full items-center gap-2">
                <a
                    href="/"
                    class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_home()}
                    title={m.nav_home()}
                >
                    <Logo alt="Arc" class="transition-colors hover:text-white" />
                </a>

                <a
                    href="/shows/new"
                    class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
                >
                    {m.nav_new()}
                </a>
            </div>

            <a
                href="/shows/popular"
                class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {m.nav_popular()}
            </a>

            <a
                href="/simulcast"
                class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {m.nav_simulcast()}
            </a>

            <Dropdown
                id="categories-menu"
                ariaLabel="Categories"
                menuAlign="start"
                modal
                menuClass="!top-full !right-auto !left-0 w-[min(52rem,calc(100vw-2rem))] shadow-2xl"
                contentClass="bg-header-hover"
                rootClass="h-full"
                triggerClass="hidden h-full items-center gap-2 px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {#snippet trigger()}
                    <span>Categories</span>
                    <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                {/snippet}
                {#snippet content()}
                    <div class="grid grid-cols-[minmax(12rem,1fr)_1px_minmax(0,2fr)]">
                        <div>
                            <a
                                href="/shows/new"
                                class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                            >
                                {m.nav_new()}
                            </a>
                            <a
                                href="/shows/popular"
                                class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                            >
                                {m.nav_popular()}
                            </a>
                            <a
                                href="/simulcast"
                                class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                            >
                                {m.nav_simulcast()}
                            </a>
                            <a
                                href="/release-calendar"
                                class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                            >
                                {m.nav_release_calendar()}
                            </a>
                        </div>
                        <div class="bg-border" aria-hidden="true"></div>
                        <div class="min-w-0 py-5">
                            <p class="mb-3 px-5 text-xs font-bold tracking-wide text-muted uppercase">Genres</p>
                            <div class="grid grid-cols-3">
                                {#each data.genres as genre}
                                    <a
                                        href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                        class="flex min-h-11 items-center px-5 text-sm text-muted transition-colors hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {genre}
                                    </a>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/snippet}
            </Dropdown>
        </div>

        <div class="hidden h-full items-center sm:flex">
            <a
                href="/search"
                class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                aria-label={m.nav_search()}
                title={m.nav_search()}
            >
                <MagnifyingGlassIcon size={24} weight="regular" aria-hidden="true" />
            </a>

            <a
                href="/watchlist"
                class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                aria-label={m.nav_watchlist()}
                title={m.nav_watchlist()}
            >
                <BookmarkSimpleIcon size={24} weight="regular" aria-hidden="true" />
            </a>

            {#if data.account}
                <Dropdown
                    id="account-menu"
                    ariaLabel={m.nav_account_menu()}
                    modal
                    menuClass="w-[min(21rem,calc(100vw-1rem))]"
                    triggerClass="flex h-14 cursor-pointer items-center gap-1 px-1.5 text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-2 sm:px-3"
                >
                    {#snippet trigger()}
                        <AccountAvatar
                            username={data.account.username}
                            image={data.account.image}
                            class="size-8 text-sm ring-1 ring-white/20"
                        />
                        <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                    {/snippet}

                    {#snippet content()}
                        <div class="bg-panel-strong">
                            <div class="flex min-h-20 items-center gap-3 px-5 py-3">
                                <AccountAvatar
                                    username={data.account.username}
                                    image={data.account.image}
                                    class="size-11 text-lg"
                                />
                                <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                                    {data.account.name}
                                </span>
                            </div>
                        </div>

                        <a
                            href="/settings"
                            class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                        >
                            <GearIcon size={21} aria-hidden="true" />
                            <span>{m.nav_settings()}</span>
                        </a>

                        <a
                            href="/watchlist"
                            class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                        >
                            <BookmarkSimpleIcon size={21} aria-hidden="true" />
                            <span>{m.nav_watchlist()}</span>
                        </a>

                        <button
                            type="button"
                            class="flex min-h-14 w-full items-center gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus-visible:bg-panel-hover focus-visible:text-foreground focus-visible:outline-none"
                            onclick={signOut}
                        >
                            <SignOutIcon size={21} aria-hidden="true" />
                            <span>{m.nav_logout()}</span>
                        </button>
                    {/snippet}
                </Dropdown>
            {:else}
                <a
                    href="/login"
                    class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                    aria-label={m.nav_login()}
                    title={m.nav_login()}
                >
                    <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                </a>
            {/if}
        </div>

        <div class="pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-between sm:hidden">
            <Dropdown
                id="mobile-navigation"
                ariaLabel={m.nav_open_navigation()}
                menuAlign="start"
                menuClass="!fixed !top-14 !right-0 !bottom-0 !left-0 !h-[calc(100dvh-3.5rem)] !w-screen bg-header-hover z-50 pointer-events-auto"
                contentClass="h-full overflow-y-auto overscroll-contain bg-header-hover"
                closeOnSelection={false}
                modal
                triggerClass="pointer-events-auto grid h-14 w-14 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground data-[state=open]:bg-header-hover data-[state=open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                {#snippet trigger()}
                    <ListIcon size={24} aria-hidden="true" />
                {/snippet}

                {#snippet content()}
                    <nav class="bg-header-hover px-0" aria-label={m.nav_primary()} data-dropdown-close>
                        <a
                            href="/shows/new"
                            class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {m.nav_new()}
                        </a>
                        <a
                            href="/shows/popular"
                            class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {m.nav_popular()}
                        </a>
                        <a
                            href="/simulcast"
                            class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {m.nav_simulcast()}
                        </a>
                        <a
                            href="/release-calendar"
                            class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {m.nav_release_calendar()}
                        </a>
                    </nav>

                    <div class="bg-header-hover">
                        <button
                            type="button"
                            class="flex min-h-12 w-full items-center justify-between px-5 text-left text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            aria-expanded={mobileCategoriesOpen}
                            aria-controls="mobile-navigation-categories"
                            onclick={() => (mobileCategoriesOpen = !mobileCategoriesOpen)}
                        >
                            <span>Categories</span>
                            <CaretDownIcon
                                size={18}
                                weight="bold"
                                class={mobileCategoriesOpen ? 'rotate-180' : ''}
                                aria-hidden="true"
                            />
                        </button>
                        {#if mobileCategoriesOpen}
                            <nav
                                id="mobile-navigation-categories"
                                class="bg-panel-strong px-3 py-2"
                                aria-label="Categories"
                                data-dropdown-close
                            >
                                {#each data.genres as genre}
                                    <a
                                        href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                        class="block px-5 py-2.5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        {genre}
                                    </a>
                                {/each}
                            </nav>
                        {/if}
                    </div>

                    {#if data.account}
                        <button
                            type="button"
                            class="block w-full border-t border-border/60 bg-header-hover px-5 py-3 text-left text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            data-dropdown-close
                            onclick={signOut}
                        >
                            {m.nav_logout()}
                        </button>
                    {:else}
                        <a
                            href="/login"
                            class="block bg-header-hover px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            data-dropdown-close
                        >
                            {m.nav_login()}
                        </a>
                    {/if}
                {/snippet}
            </Dropdown>

            <div class="pointer-events-auto ml-auto flex h-full items-center bg-header">
                <a
                    href="/search"
                    class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_search()}
                >
                    <MagnifyingGlassIcon size={24} aria-hidden="true" />
                </a>
                <a
                    href="/watchlist"
                    class="grid h-14 w-12 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_watchlist()}
                >
                    <BookmarkSimpleIcon size={24} aria-hidden="true" />
                </a>
                {#if data.account}
                    <a
                        href="/settings"
                        class="grid h-14 w-12 place-items-center hover:bg-header-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={m.nav_settings()}
                    >
                        <AccountAvatar
                            username={data.account.username}
                            image={data.account.image}
                            class="size-8 text-sm ring-1 ring-white/20"
                        />
                    </a>
                {:else}
                    <a
                        href="/login"
                        class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={m.nav_login()}
                    >
                        <UserCircleIcon size={30} weight="fill" aria-hidden="true" />
                    </a>
                {/if}
            </div>
        </div>
    </nav>
</header>

<div id="main-content" class="pt-14" tabindex="-1">
    {#if navigationLoading}
        <PageLoading label={m.navigation_loading()} />
    {:else}
        {@render children()}
    {/if}
</div>
